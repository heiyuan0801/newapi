from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import io
import socket
import sys

import release
import drill


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.binary = self.root/'new-api'
        self.binary.write_bytes(b'old-binary')
        self.binary.chmod(0o755)
        self.config_file = self.root/'service.env'
        self.config_file.write_text('SESSION_SECRET=synthetic-test-only\n')
        self.uploads = self.root/'uploads'
        self.uploads.mkdir()
        (self.uploads/'fixture.txt').write_text('preserved upload')
        (self.uploads/'manifest.json').write_text('{"fixture":true}')
        self.db = self.root/'main.sqlite'
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER, api_key TEXT)')
            db.execute("INSERT INTO accounts VALUES (1,100,'synthetic-fixture-not-real')")
        self.backups = self.root/'backups'
        self.backups.mkdir(mode=0o700)
        self.config = dict(instance='test',redis_enabled=False,multi_instance=False,binary=str(self.binary),backup_dir=str(self.backups),stop_command=['false'],start_command=['false'],health_url='http://127.0.0.1:9/api/status',databases={'main':{'engine':'sqlite','path':str(self.db)}},data_dirs={'uploads':str(self.uploads)},config_files={'environment':str(self.config_file)})

    def test_sqlite_wal_backup_and_restore_preserve_balance_keys_files_and_version(self):
        connection = sqlite3.connect(self.db)
        self.addCleanup(connection.close)
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('UPDATE accounts SET balance=77')
        connection.commit()
        backup = release.snapshot(self.config, 'fixed-version')
        connection.close()
        self.binary.write_bytes(b'new-binary')
        self.config_file.write_text('changed')
        (self.uploads/'fixture.txt').write_text('changed')
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute('DELETE FROM accounts')
        self.assertEqual('fixed-version', release.restore(self.config, backup))
        with closing(sqlite3.connect(self.db)) as db, db:
            self.assertEqual([(1,77,'synthetic-fixture-not-real')],db.execute('SELECT * FROM accounts').fetchall())
            self.assertEqual('ok',db.execute('PRAGMA integrity_check').fetchone()[0])
        self.assertEqual(b'old-binary',self.binary.read_bytes())
        self.assertEqual(0o755,self.binary.stat().st_mode & 0o777)
        self.assertEqual(0o644,(self.uploads/'fixture.txt').stat().st_mode & 0o777)
        self.assertEqual('preserved upload',(self.uploads/'fixture.txt').read_text())
        self.assertIn('synthetic-test-only',self.config_file.read_text())

    def test_corrupt_payload_is_rejected_without_changing_live_data(self):
        backup = release.snapshot(self.config,'base')
        (backup/'db-main').write_bytes(b'broken')
        with self.assertRaises(release.OperationError):
            release.restore(self.config,backup)
        with closing(sqlite3.connect(self.db)) as db, db:
            self.assertEqual(100,db.execute('SELECT balance FROM accounts').fetchone()[0])

    def test_extra_files_path_escape_and_cross_instance_backups_are_rejected(self):
        backup = release.snapshot(self.config,'base')
        original = (backup/'manifest.json').read_text()
        manifest = json.loads(original)
        manifest['files']['../escape'] = 'untrusted'
        (backup/'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaises(release.OperationError):release.verify(backup,self.config)
        (backup/'manifest.json').write_text(original)
        (backup/'extra').write_text('unexpected')
        with self.assertRaises(release.OperationError):release.verify(backup,self.config)
        (backup/'extra').unlink()
        other = dict(self.config,instance='other')
        with self.assertRaises(release.OperationError):release.verify(backup,other)

    def test_symlink_backups_and_overlapping_managed_paths_are_rejected(self):
        (self.uploads/'escape').symlink_to(self.config_file)
        with self.assertRaises(release.OperationError):release.snapshot(self.config,'base')
        config = dict(self.config,backup_dir=str(self.uploads/'backups'))
        path = self.root/'ops.json'
        path.write_text(json.dumps(config));path.chmod(0o600)
        with self.assertRaises(release.OperationError):release.load_config(path)

    def test_second_maintenance_operation_cannot_acquire_the_lock(self):
        with release.locked(self.config):
            with self.assertRaises(release.OperationError):
                with release.locked(self.config):pass

    def test_missing_required_payload_and_symlink_root_are_rejected(self):
        backup = release.snapshot(self.config,'base')
        link = self.root/'backup-link'
        link.symlink_to(backup, target_is_directory=True)
        with self.assertRaises(release.OperationError):release.verify(link,self.config)
        manifest = json.loads((backup/'manifest.json').read_text())
        del manifest['files']['binary']
        (backup/'binary').unlink()
        (backup/'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaises(release.OperationError):release.verify(backup,self.config)

    def test_noop_stop_command_cannot_authorize_data_changes(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',0));listener.listen()
            config = dict(self.config, stop_command=[sys.executable,'-c','pass'], stop_timeout_seconds=0,
                          health_url=f'http://127.0.0.1:{listener.getsockname()[1]}/api/status')
            with self.assertRaises(release.OperationError):release.service(config,'stop')

    def test_http_status_cannot_hide_a_corrupt_database_or_unsafe_batch_mode(self):
        for batch_enabled in [False, True]:
            payload = {'success':True,'data':{'version':'base','enable_batch_update':batch_enabled}}
            opener = SimpleNamespace(open=lambda *args, **kwargs: io.BytesIO(json.dumps(payload).encode()))
            if not batch_enabled:
                self.db.write_bytes(b'corrupt database')
            with patch.object(release.urllib.request,'build_opener',return_value=opener):
                with self.assertRaises(release.OperationError):release.health(self.config,'base',wait=False)

    def test_redis_or_cluster_profiles_are_rejected_before_maintenance(self):
        for updates in [{'redis_enabled':True},{'multi_instance':True}]:
            path = self.root/'unsupported.json'
            path.write_text(json.dumps(dict(self.config,**updates)));path.chmod(0o600)
            with self.assertRaises(release.OperationError):release.load_config(path)

    def test_bad_candidate_checksum_fails_before_stopping_service(self):
        config_path = self.root/'ops.json'
        release.private_json(config_path,self.config)
        candidate = self.root/'candidate';candidate.write_bytes(b'bad-candidate')
        args = ['release.py','upgrade','--config',str(config_path),'--confirm-instance','test',
                '--candidate',str(candidate),'--version','next','--sha256','0'*64]
        with patch.object(sys,'argv',args), patch.object(release,'service') as service:
            with self.assertRaises(release.OperationError):release.main()
            service.assert_not_called()

    def test_drill_rejects_non_disposable_database_names_before_building_or_writing(self):
        for name in ['production', 'new_api_ci_bad;DROP', 'new_api_ci_'+('x'*64)]:
            output=self.root/'new-drill'
            args=['drill.py','--output',str(output),'--sql-database',name]
            with patch.object(sys,'argv',args), patch.object(drill,'run') as run:
                with self.assertRaises(SystemExit) as rejected:
                    drill.main()
                self.assertEqual(2,rejected.exception.code)
                run.assert_not_called()
                self.assertFalse(output.exists())

    def test_drill_gateway_does_not_inherit_external_database_or_redis_connections(self):
        (self.root/'service.json').write_text(json.dumps({'port':19999}))
        with patch.dict(os.environ,{'SQL_DSN':'synthetic-external-db','LOG_SQL_DSN':'synthetic-external-log','REDIS_CONN_STRING':'redis://synthetic-external-redis'}), patch.object(drill.subprocess,'Popen',return_value=SimpleNamespace(pid=12345)) as start:
            drill.service_action(self.root,'start')
        env=start.call_args.kwargs['env']
        self.assertNotIn('SQL_DSN',env)
        self.assertNotIn('LOG_SQL_DSN',env)
        self.assertEqual('',env['REDIS_CONN_STRING'])


if __name__ == '__main__':
    unittest.main()
