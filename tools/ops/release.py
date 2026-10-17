#!/usr/bin/env python3
"""New API maintenance: verified backups, fixed-binary upgrades and database rollback.

Use only for a dedicated instance with ALL writers stopped by stop_command.
Configuration and backups contain sensitive data and must stay outside Git.
"""
import argparse
from contextlib import contextmanager, closing
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.request
import urllib.parse
import uuid


class OperationError(Exception):
    pass


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def private_json(path, value):
    with path.open('x', encoding='utf-8') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())


def load_config(path):
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise OperationError('Configuration must be a regular private file (chmod 600)')
    config = json.loads(path.read_text())
    if config.get('redis_enabled') is not False or config.get('multi_instance') is not False:
        raise OperationError('This recovery profile requires explicitly disabled Redis and a single instance; coordinated cache/cluster recovery needs a separate runbook')
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', config['instance']):
        raise OperationError('Invalid instance name')
    config['binary'] = str(Path(config['binary']).absolute())
    backup = Path(config['backup_dir']).absolute()
    binary = Path(config['binary'])
    if binary.is_symlink() or not binary.is_file():
        raise OperationError('binary must be an existing regular executable, not a symlink')
    for action in ['stop_command', 'start_command']:
        if not isinstance(config[action], list) or not config[action] or not all(isinstance(v, str) for v in config[action]):
            raise OperationError('Service commands must be explicit argument arrays')
    roots = [binary, *[Path(p).absolute() for p in config.get('data_dirs', {}).values()], *[Path(p).absolute() for p in config.get('config_files', {}).values()]]
    if any(backup == p or backup.is_relative_to(p) or p.is_relative_to(backup) for p in roots):
        raise OperationError('Backup directory and managed resources must not overlap')
    for resources in [config['databases'], config.get('data_dirs', {}), config.get('config_files', {})]:
        for name in resources:
            if not re.fullmatch(r'[a-zA-Z0-9_-]+', name):
                raise OperationError('Invalid resource name')
    sqlite_paths = []
    for db in config['databases'].values():
        if db['engine'] == 'sqlite':
            p = Path(db['path']).absolute()
            sqlite_paths.append(p)
            if backup == p or p.is_relative_to(backup):
                raise OperationError('SQLite database cannot be inside backup directory')
        elif db['engine'] in ['mysql', 'postgres']:
            if not db.get('dedicated') or not re.fullmatch(r'[a-zA-Z0-9_]+', db['database']):
                raise OperationError('Restore requires an explicitly dedicated database with a simple name')
            if db['engine'] == 'mysql':
                credentials = Path(db['defaults_file'])
                if not credentials.is_file() or credentials.stat().st_mode & 0o077:
                    raise OperationError('MySQL defaults file must be private (chmod 600)')
        else:
            raise OperationError('Unsupported database: use an engine-specific backup process before upgrading')
    for directory in config.get('data_dirs', {}).values():
        p = Path(directory).absolute()
        if p.is_symlink() or not p.is_dir() or any(db.is_relative_to(p) for db in sqlite_paths):
            raise OperationError('data_dirs must contain regular file trees, separate from database files')
    url = urllib.parse.urlsplit(config['health_url'])
    if url.scheme != 'http' or url.hostname not in ['127.0.0.1', 'localhost', '::1'] or url.username or url.password or url.query or url.path != '/api/status':
        raise OperationError('health_url must address the local gateway directly, not a proxy')
    if not config['databases']:
        raise OperationError('At least one database must be configured')
    roots.extend(sqlite_paths)
    for i, left in enumerate(roots):
        for right in roots[i+1:]:
            if left == right or left.is_relative_to(right) or right.is_relative_to(left):
                raise OperationError('Managed file resources must not overlap')
    config['backup_dir'] = str(backup)
    return config


def execute(command, *, env=None, output=None, input_bytes=None, input_file=None, timeout=None):
    try:
        result = subprocess.run(command, env=env, input=input_bytes, stdin=input_file, stdout=output or subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise OperationError('Service or database readiness command timed out') from None
    if result.returncode:
        # Never echo commands, DSNs, native diagnostics or environment secrets.
        raise OperationError('A service or database command failed; inspect the service/native client locally')
    return result.stdout


def service(config, action):
    execute(config[action + '_command'], timeout=config.get('service_command_timeout_seconds', 180))
    if action != 'stop':
        return
    url = urllib.parse.urlsplit(config['health_url'])
    deadline = time.monotonic() + config.get('stop_timeout_seconds', 30)
    while True:
        try:
            connection = socket.create_connection((url.hostname, url.port or 80), timeout=1)
            connection.close()
        except ConnectionRefusedError:
            return
        except OSError:
            raise OperationError('Unable to prove the gateway is stopped') from None
        if time.monotonic() >= deadline:
            raise OperationError('Gateway still listens after stop command; refusing to modify data')
        time.sleep(0.1)


def health(config, expected=None, wait=True):
    deadline = time.monotonic() + (config.get('health_timeout_seconds', 30) if wait else 0)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while True:
        try:
            with opener.open(config['health_url'], timeout=2) as response:
                state = json.load(response)
            version = state.get('data', {}).get('version')
            if state.get('success') is True and isinstance(version, str) and state.get('data', {}).get('enable_batch_update') is False and (expected is None or version == expected):
                for db in config['databases'].values():
                    if db['engine'] == 'sqlite':
                        with closing(sqlite3.connect(Path(db['path']).absolute().as_uri()+'?mode=ro', uri=True)) as connection:
                            if connection.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0] == 0:
                                raise OperationError('Database readiness failed')
                    elif db['engine'] == 'mysql':
                        native(db, 'mysql', [db['database'], '--execute', 'SELECT 1'], timeout=2)
                    else:
                        native(db, 'psql', ['-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1'], timeout=2)
                return version
        except Exception:
            pass
        if time.monotonic() >= deadline:
            raise OperationError('Health or exact version check failed')
        time.sleep(0.25)


def native(db, program, args, *, output=None, input_bytes=None, input_file=None, admin=False, timeout=None):
    env = dict(os.environ)
    if db['engine'] == 'mysql':
        command = [db.get(program, program), '--defaults-extra-file=' + db['defaults_file'], *args]
    else:
        env.update(db.get('env', {}))
        env['PGDATABASE'] = db.get('admin_database', 'postgres') if admin else db['database']
        command = [db.get(program, program), *args]
    return execute(command, env=env, output=output, input_bytes=input_bytes, input_file=input_file, timeout=timeout)


def backup_db(db, dest):
    if db['engine'] == 'sqlite':
        source = Path(db['path'])
        if not source.is_file() or source.is_symlink():
            raise OperationError('SQLite source must exist and must not be a symlink')
        with closing(sqlite3.connect(source.as_uri()+'?mode=ro', uri=True)) as src, closing(sqlite3.connect(dest)) as target:
            src.backup(target)
            # A standalone backup must never depend on generated WAL/SHM files.
            target.execute('PRAGMA journal_mode=DELETE')
            if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise OperationError('SQLite backup integrity check failed')
    elif db['engine'] == 'mysql':
        with dest.open('wb') as output:
            native(db, 'mysqldump', ['--single-transaction', '--routines', '--triggers', '--hex-blob', '--no-tablespaces', '--set-gtid-purged=OFF', db['database']], output=output)
    else:
        with dest.open('wb') as output:
            native(db, 'pg_dump', ['--format=custom', '--no-owner', '--no-privileges'], output=output)
    os.chmod(dest, 0o600)


def regular_tree(root):
    for path in root.rglob('*'):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise OperationError('Managed trees cannot contain symlinks or special files')


def file_metadata(path):
    info = Path(path).stat()
    return {'uid':info.st_uid, 'gid':info.st_gid, 'mode':info.st_mode & 0o777}


def apply_metadata(path, metadata):
    info = Path(path).stat()
    if (info.st_uid, info.st_gid) != (metadata['uid'], metadata['gid']):
        os.chown(path, metadata['uid'], metadata['gid'])
    os.chmod(path, metadata['mode'])


def snapshot(config, version):
    name = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    target = Path(config['backup_dir']) / name
    target.mkdir(mode=0o700)
    try:
        metadata = {'binary':file_metadata(config['binary'])}
        shutil.copyfile(config['binary'], target/'binary')
        os.chmod(target/'binary', 0o700)
        for name, path in config.get('config_files', {}).items():
            source = Path(path)
            if source.is_symlink() or not source.is_file():
                raise OperationError('Configuration source must be a regular file')
            shutil.copyfile(source, target/('config-'+name))
            os.chmod(target/('config-'+name), 0o600)
            metadata['config-'+name] = dict(file_metadata(source), mode=0o600)
        for name, path in config.get('data_dirs', {}).items():
            source = Path(path)
            regular_tree(source)
            shutil.copytree(source, target/('data-'+name))
            metadata['data-'+name] = file_metadata(source)
            for entry in source.rglob('*'):
                metadata[str(Path('data-'+name)/entry.relative_to(source))] = file_metadata(entry)
        for name, db in config['databases'].items():
            backup_db(db, target/('db-'+name))
            if db['engine'] == 'sqlite':
                metadata['db-'+name] = dict(file_metadata(db['path']), mode=0o600)
        for p in target.rglob('*'):
            os.chmod(p, 0o700 if p.is_dir() or p.name == 'binary' else 0o600)
        files = {str(p.relative_to(target)): digest(p) for p in target.rglob('*') if p.is_file()}
        manifest = {'schema':1, 'instance':config['instance'], 'version':version, 'files':files, 'metadata':metadata, 'databases':{n:db['engine'] for n,db in config['databases'].items()}, 'data_dirs':list(config.get('data_dirs', {})), 'config_files':list(config.get('config_files', {}))}
        private_json(target/'manifest.json', manifest)
        verify(target, config)
        return target
    except Exception:
        # A partial backup is retained for diagnostics, but is never usable.
        raise OperationError('Backup failed; no deployment was attempted') from None


def verify(backup, config=None):
    if backup.is_symlink():
        raise OperationError('Backup directory must not be a symlink')
    backup = backup.resolve()
    if backup.stat().st_mode & 0o077:
        raise OperationError('Backup directory must be private (chmod 700)')
    regular_tree(backup)
    manifest = json.loads((backup/'manifest.json').read_text())
    if manifest.get('schema') != 1 or not manifest.get('files'):
        raise OperationError('Invalid backup manifest')
    required = {'binary', *('db-'+n for n in manifest['databases']), *('config-'+n for n in manifest['config_files'])}
    if not required.issubset(manifest['files']) or not isinstance(manifest.get('version'), str) or not manifest['version']:
        raise OperationError('Required backup payload is missing')
    if any(not (backup/('data-'+n)).is_dir() for n in manifest['data_dirs']):
        raise OperationError('Required data tree is missing')
    actual = {str(p.relative_to(backup)) for p in backup.rglob('*') if p.is_file() and p != backup/'manifest.json'}
    if actual != set(manifest['files']):
        raise OperationError('Backup inventory mismatch')
    expected_metadata = {'binary', *('config-'+n for n in manifest['config_files']), *('db-'+n for n,e in manifest['databases'].items() if e == 'sqlite')}
    for name in manifest['data_dirs']:
        root = backup/('data-'+name)
        expected_metadata.add('data-'+name)
        expected_metadata.update(str(p.relative_to(backup)) for p in root.rglob('*'))
    if set(manifest.get('metadata', {})) != expected_metadata:
        raise OperationError('Backup ownership metadata is incomplete')
    for item in manifest['metadata'].values():
        if set(item) != {'uid','gid','mode'} or not all(type(v) is int and v >= 0 for v in item.values()) or item['mode'] > 0o777:
            raise OperationError('Invalid ownership metadata')
        if os.geteuid() != 0 and item['uid'] != os.geteuid():
            raise OperationError('Restore requires the original service owner or an authorized root operator')
    for name, expected in manifest['files'].items():
        path = backup/name
        if not path.resolve().is_relative_to(backup) or path.stat().st_mode & 0o077 or digest(path) != expected:
            raise OperationError('Backup checksum, path or permissions check failed')
    if config:
        if manifest['instance'] != config['instance'] or manifest['databases'] != {n:db['engine'] for n,db in config['databases'].items()} or set(manifest['data_dirs']) != set(config.get('data_dirs', {})) or set(manifest['config_files']) != set(config.get('config_files', {})):
            raise OperationError('Backup does not match the configured instance/resources')
    for name, engine in manifest['databases'].items():
        if engine == 'sqlite':
            with closing(sqlite3.connect((backup/('db-'+name)).as_uri()+'?mode=ro', uri=True)) as db:
                if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise OperationError('SQLite integrity check failed')
    return manifest


def restore_db(db, source):
    if db['engine'] == 'sqlite':
        dest = Path(db['path'])
        with closing(sqlite3.connect(source.as_uri()+'?mode=ro', uri=True)) as src, closing(sqlite3.connect(dest)) as target:
            src.backup(target)
        os.chmod(dest, 0o600)
    elif db['engine'] == 'mysql':
        name = db['database']
        native(db, 'mysql', ['--batch'], input_bytes=f'DROP DATABASE IF EXISTS `{name}`; CREATE DATABASE `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'.encode())
        with source.open('rb') as stream:
            native(db, 'mysql', [name], input_file=stream)
    else:
        name = db['database']
        native(db, 'psql', ['-v', 'ON_ERROR_STOP=1', '-c', f'DROP DATABASE IF EXISTS "{name}";'], admin=True)
        native(db, 'psql', ['-v', 'ON_ERROR_STOP=1', '-c', f'CREATE DATABASE "{name}";'], admin=True)
        native(db, 'pg_restore', ['--exit-on-error', '--no-owner', '--no-privileges', '--dbname='+name, str(source)])


def install(source, dest, mode, metadata=None):
    dest = Path(dest)
    temporary = dest.with_name('.'+dest.name+'.'+uuid.uuid4().hex)
    try:
        shutil.copyfile(source, temporary)
        os.chmod(temporary, mode)
        if metadata:
            apply_metadata(temporary, metadata)
        with temporary.open('rb') as stream:
            os.fsync(stream.fileno())
        os.replace(temporary, dest)
    finally:
        temporary.unlink(missing_ok=True)


def restore(config, backup):
    manifest = verify(backup, config)
    for name, db in config['databases'].items():
        restore_db(db, backup/('db-'+name))
        if db['engine'] == 'sqlite':
            apply_metadata(db['path'], manifest['metadata']['db-'+name])
    for name, dest in config.get('data_dirs', {}).items():
        shutil.rmtree(dest)
        shutil.copytree(backup/('data-'+name), dest)
        prefix = 'data-'+name
        for relative, metadata in sorted(manifest['metadata'].items(), key=lambda item: len(Path(item[0]).parts), reverse=True):
            if relative == prefix or relative.startswith(prefix+'/'):
                apply_metadata(Path(dest)/Path(relative).relative_to(prefix), metadata)
    for name, dest in config.get('config_files', {}).items():
        install(backup/('config-'+name), dest, 0o600, manifest['metadata']['config-'+name])
    install(backup/'binary', config['binary'], 0o700, manifest['metadata']['binary'])
    return manifest['version']


@contextmanager
def locked(config):
    root = Path(config['backup_dir'])
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.is_symlink() or root.stat().st_mode & 0o077:
        raise OperationError('backup_dir must be a private regular directory')
    with (root/'.lock').open('a') as stream:
        os.chmod(root/'.lock', 0o600)
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise OperationError('Another maintenance operation is running') from None
        yield


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['backup', 'verify', 'upgrade', 'restore'])
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--backup', type=Path)
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--sha256')
    parser.add_argument('--version')
    parser.add_argument('--confirm-instance', help='Required for actions that stop or replace this instance')
    args = parser.parse_args()
    config = load_config(args.config)
    if args.action == 'verify':
        if args.backup is None:
            raise OperationError('--backup is required')
        verify(args.backup, config)
        print(json.dumps({'status':'verified'}))
        return 0
    if args.confirm_instance != config['instance']:
        raise OperationError('Supply --confirm-instance with the configured instance name')
    if args.action == 'upgrade':
        if not args.candidate or args.candidate.is_symlink() or not args.candidate.is_file() or not args.version or not args.sha256 or digest(args.candidate) != args.sha256:
            raise OperationError('Supply a regular candidate binary, exact version and matching SHA-256')
    if args.action == 'restore':
        if args.backup is None:
            raise OperationError('--backup is required')
        verify(args.backup, config)  # No service interruption for an invalid backup.
    with locked(config):
        try:
            previous_version = health(config, wait=False)
        except OperationError:
            if args.action != 'restore':
                raise
            previous_version = 'unknown'
        service(config, 'stop')
        try:
            before = snapshot(config, previous_version)
        except Exception:
            service(config, 'start')
            raise
        if args.action == 'backup':
            service(config, 'start')
            health(config, previous_version)
            print(json.dumps({'status':'backed_up','backup':str(before),'version':previous_version}))
            return 0
        try:
            if args.action == 'upgrade':
                install(args.candidate, config['binary'], 0o700, file_metadata(config['binary']))
                expected = args.version
            else:
                expected = restore(config, args.backup.resolve())
            service(config, 'start')
            health(config, expected)
            print(json.dumps({'status':'healthy','version':expected,'safety_backup':str(before)}))
            return 0
        except Exception:
            service(config, 'stop')
            expected = restore(config, before)
            service(config, 'start')
            health(config, expected)
            print(json.dumps({'status':'rolled_back','version':expected,'backup':str(before)}))
            return 1


if __name__ == '__main__':
    os.umask(0o077)
    try:
        sys.exit(main())
    except (OperationError, KeyError, ValueError, OSError):
        print('Maintenance failed safely. Check the private config, backup and service locally; credentials were not printed.', file=sys.stderr)
        sys.exit(2)
