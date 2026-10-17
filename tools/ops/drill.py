#!/usr/bin/env python3
"""Isolated real gateway upgrade/rollback and native SQL restore drill. No production endpoints."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.parse

import release

ROOT = Path(__file__).resolve().parents[2]


def run(args, *, env=None, cwd=ROOT, log=None, expected=0):
    result = subprocess.run(args,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if log:log.write_bytes(result.stdout+result.stderr)
    if result.returncode != expected:
        raise RuntimeError('Drill command failed; see private drill logs')
    return result.stdout


def service_action(directory, action):
    """Called only by the drill's explicit service command array, never by production."""
    state = directory/'process.json'
    settings = json.loads((directory/'service.json').read_text())
    if action == 'stop':
        if not state.exists():return
        pid = json.loads(state.read_text())['pid']
        try:
            os.kill(pid,signal.SIGTERM)
        except ProcessLookupError:
            state.unlink();return
        for _ in range(200):
            try:
                os.kill(pid,0)
                # On Linux the orphan may be a zombie until its parent reaps it.
                status = Path(f'/proc/{pid}/stat')
                if status.exists() and status.read_text().split()[2]=='Z':break
                if sys.platform == 'darwin':
                    status = subprocess.run(['ps','-p',str(pid),'-o','stat='],capture_output=True,text=True)
                    if status.returncode or status.stdout.strip().startswith('Z'):break
            except ProcessLookupError:break
            time.sleep(0.05)
        else:raise RuntimeError('Service did not stop; refusing to back up')
        state.unlink()
        return
    marker=directory/'inject-once'
    if marker.exists():
        marker.unlink()
        with closing(sqlite3.connect(directory/'main.sqlite')) as db:
            db.execute('UPDATE users SET quota=1');db.commit()
        (directory/'uploads/fixture.txt').write_text('failed candidate modified upload')
        (directory/'app.env').write_text('failed candidate modified config')
    env=dict(os.environ,PORT=str(settings['port']),SQLITE_PATH=str(directory/'main.sqlite'),SESSION_SECRET='disposable-recovery-drill-secret',SESSION_COOKIE_SECURE='false',TRUSTED_PROXIES='none',GENERATE_DEFAULT_TOKEN='false',UPDATE_TASK='false',TASK_PLUGIN_ENABLED='false',BATCH_UPDATE_ENABLED='false')
    env.pop('SQL_DSN',None);env.pop('LOG_SQL_DSN',None)
    env['REDIS_CONN_STRING']=''
    with (directory/'gateway.log').open('ab') as output:
        process=subprocess.Popen([str(directory/'new-api'),'--log-dir',str(directory/'logs')],cwd=directory,env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
    state.write_text(json.dumps({'pid':process.pid}))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--service-action',choices=['start','stop'],help=argparse.SUPPRESS)
    parser.add_argument('--sqlite-only',action='store_true')
    parser.add_argument('--sql-database',default='new_api_ci_restore',help='New disposable native SQL database name; never replaces an existing database')
    args=parser.parse_args();out=args.output.resolve()
    if args.service_action:
        service_action(out,args.service_action);return
    if not re.fullmatch(r'new_api_ci_[a-z0-9_]+',args.sql_database) or len(args.sql_database)>63:
        parser.error('SQL drill database must be a new_api_ci_ name of at most 63 characters')
    out.mkdir(parents=True,mode=0o700,exist_ok=False)
    env=dict(os.environ,GOWORK='off',MATRIX_CONFIRM_DISPOSABLE='yes')
    for version in ['base','next']:
        run([env.get('GO','go'),'build','-ldflags',f'-X github.com/QuantumNous/new-api/common.Version=p0-drill-{version}','-o',str(out/version),'.'],env=env,log=out/f'build-{version}.log')
    run([env.get('GO','go'),'build','-o',str(out/'dbcheck'),'./tools/dbcheck'],env=env,log=out/'build-dbcheck.log')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    (out/'service.json').write_text(json.dumps({'port':port}))
    (out/'uploads').mkdir();(out/'uploads/fixture.txt').write_text('original upload')
    (out/'app.env').write_text('SESSION_SECRET=synthetic-fixture-only\n')
    shutil.copyfile(out/'base',out/'new-api');(out/'new-api').chmod(0o700)
    config={'instance':'new-api-disposable-drill','redis_enabled':False,'multi_instance':False,'binary':str(out/'new-api'),'backup_dir':str(out/'backups'),'health_url':f'http://127.0.0.1:{port}/api/status','health_timeout_seconds':5,'databases':{'main':{'engine':'sqlite','path':str(out/'main.sqlite')}},'data_dirs':{'uploads':str(out/'uploads')},'config_files':{'environment':str(out/'app.env')}}
    for action in ['start','stop']:config[action+'_command']=[sys.executable,str(Path(__file__).resolve()),'--output',str(out),'--service-action',action]
    release.private_json(out/'ops.json',config)
    snapshot_env=dict(env,SQL_DSN='local',MATRIX_SQLITE_PATH=str(out/'main.sqlite'),MATRIX_SEED='1',MATRIX_SNAPSHOT=str(out/'seed.json'))
    snapshot_env.pop('LOG_SQL_DSN',None)
    run([str(out/'dbcheck')],env=snapshot_env,log=out/'seed.log')
    command=[sys.executable,str(ROOT/'tools/ops/release.py')]
    common=['--config',str(out/'ops.json'),'--confirm-instance',config['instance']]
    results=[]
    try:
        service_action(out,'start');release.health(config,'p0-drill-base')
        backed=json.loads(run(command+['backup',*common],log=out/'backup.log'))
        first=Path(backed['backup'])
        upgraded=json.loads(run(command+['upgrade',*common,'--candidate',str(out/'next'),'--sha256',release.digest(out/'next'),'--version','p0-drill-next'],log=out/'upgrade.log'))
        assert upgraded['status']=='healthy'
        results.append({'check':'exact-version upgrade','result':'passed'})
        (out/'inject-once').touch()
        failed=json.loads(run(command+['upgrade',*common,'--candidate',str(out/'next'),'--sha256',release.digest(out/'next'),'--version','deliberately-wrong-version'],expected=1,log=out/'rollback.log'))
        assert failed['status']=='rolled_back' and release.health(config)=='p0-drill-next'
        with closing(sqlite3.connect(out/'main.sqlite')) as db:assert db.execute("SELECT quota FROM users WHERE username='matrix-preserved'").fetchone()[0]==345678
        assert (out/'uploads/fixture.txt').read_text()=='original upload'
        assert 'synthetic-fixture-only' in (out/'app.env').read_text()
        results.append({'check':'failed upgrade restores DB, binary, config and uploads','result':'passed'})
        restored=json.loads(run(command+['restore',*common,'--backup',str(first)],log=out/'restore.log'))
        assert restored['status']=='healthy' and release.health(config)=='p0-drill-base'
        results.append({'check':'explicit previous-version restore','result':'passed'})
    finally:service_action(out,'stop')
    if not args.sqlite_only:
        for engine in ['mysql','postgres']:
            dsn=env[f'TEST_{engine.upper()}_DSN'];database=dsn.split('/')[-1].split('?')[0]
            assert database.startswith('new_api_ci_'),'Only disposable CI DSNs are accepted'
            name=args.sql_database
            if engine=='mysql':
                match=re.fullmatch(r'([^:]+):(.*?)@tcp\(([^:]+):(\d+)\)/.*',dsn);assert match
                user,password,host,dbport=match.groups()
                defaults=out/'mysql.cnf';defaults.write_text(f'[client]\nhost={host}\nport={dbport}\nuser={user}\npassword={password}\n');defaults.chmod(0o600)
                db={'engine':engine,'database':name,'dedicated':True,'defaults_file':str(defaults)}
                target_dsn=dsn.replace('/'+database,'/'+name)
                release.native(db,'mysql',['--batch'],input_bytes=f'CREATE DATABASE `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'.encode())
            else:
                parsed=urllib.parse.urlsplit(dsn)
                pg_env={'PGHOST':parsed.hostname,'PGPORT':str(parsed.port or 5432),'PGUSER':urllib.parse.unquote(parsed.username),'PGPASSWORD':urllib.parse.unquote(parsed.password or '')}
                db={'engine':engine,'database':name,'dedicated':True,'env':pg_env}
                target_dsn=dsn.replace('/'+database,'/'+name)
                release.native(db,'psql',['-v','ON_ERROR_STOP=1','-c',f'CREATE DATABASE "{name}";'],admin=True)
            state=dict(env,SQL_DSN=target_dsn,MATRIX_SNAPSHOT=str(out/f'{engine}-before.json'),MATRIX_SEED='1')
            state.pop('LOG_SQL_DSN',None)
            try:
                run([str(out/'dbcheck')],env=state,log=out/f'{engine}-seed.log')
                release.backup_db(db,out/f'{engine}.backup')
                sql=b'UPDATE users SET quota=1; DELETE FROM tokens; CREATE TABLE restore_unexpected (id INT);'
                if engine=='mysql':release.native(db,'mysql',[name],input_bytes=sql)
                else:release.native(db,'psql',['-v','ON_ERROR_STOP=1','-c',sql.decode()])
                release.restore_db(db,out/f'{engine}.backup')
                state.update(MATRIX_SEED='0',MATRIX_SNAPSHOT=str(out/f'{engine}-after.json'))
                run([str(out/'dbcheck')],env=state,log=out/f'{engine}-restored.log')
                before=json.loads((out/f'{engine}-before.json').read_text());after=json.loads((out/f'{engine}-after.json').read_text())
                for key in ['counts','indexes','rows','sensitive_fixture_hashes']:assert before[key]==after[key],(engine,key)
                results.append({'check':engine+' native restore preserves accounts, balance, key hashes and indexes','result':'passed'})
            finally:
                if engine=='mysql':release.native(db,'mysql',['--batch'],input_bytes=f'DROP DATABASE `{name}`;'.encode())
                else:release.native(db,'psql',['-v','ON_ERROR_STOP=1','-c',f'DROP DATABASE "{name}";'],admin=True)
    release.private_json(out/'result.json',{'all_passed':True,'checks':results,'production_affected':False})
    print(json.dumps({'all_passed':True,'checks':results}))


if __name__=='__main__':
    os.umask(0o077)
    main()
