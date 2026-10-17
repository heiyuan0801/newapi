#!/usr/bin/env python3
"""Run real fresh/released-upgrade/restart checks against disposable CI databases.

Never creates, drops, or restores a database. SQL DSNs must name new_api_ci_* DBs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BASELINE = '633b4c5b190dc1af99a2814391354d86948e7943'
BASELINE_TAG = 'v1.0.0-rc.44'


def run(command, cwd, env, log):
    with log.open('wb') as output:
        result = subprocess.run(command, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(f'Command failed; see {log.name}')


def compare(old, new):
    for table, count in old['counts'].items():
        assert new['counts'][table] == count, f'Row count changed: {table}'
    for table, indexes in old['indexes'].items():
        for index in indexes or []:
            assert index in (new['indexes'][table] or []), f'Index lost: {table}'
    for table, rows in old['rows'].items():
        for row in rows or []:
            key = 'id' if 'id' in row else 'key'
            actual = next(v for v in new['rows'][table] if v[key] == row[key])
            assert all(actual[k] == v for k, v in row.items()), f'Existing value changed: {table}'
    assert old['sensitive_fixture_hashes'] == new['sensitive_fixture_hashes'], 'Credential fixture changed'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', choices=['sqlite', 'mysql', 'postgres'], required=True)
    parser.add_argument('--baseline-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(mode=0o700, parents=True, exist_ok=True)
    env = dict(os.environ, MATRIX_CONFIRM_DISPOSABLE='yes', GOWORK='off')
    env.pop('LOG_SQL_DSN', None)
    # Prove the release checkout is the intended published baseline, not HEAD.
    object_root = args.baseline_root if (args.baseline_root/'.git').exists() else ROOT
    if object_root == args.baseline_root:
        assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=object_root).decode().strip() == BASELINE, 'Wrong release commit'
    for file in ['go.mod', 'model/main.go', 'model/token.go', 'model/user.go']:
        expected = subprocess.check_output(['git', 'show', f'{BASELINE}:{file}'], cwd=object_root)
        assert (args.baseline_root / file).read_bytes() == expected, f'Wrong release baseline: {file}'
    dsns = {}
    if args.engine != 'sqlite':
        for kind in ['FRESH', 'UPGRADE']:
            value = env[f'TEST_{args.engine.upper()}_{kind}_DSN']
            name = value.split('/')[-1].split('?')[0]
            assert re.fullmatch(r'new_api_ci_[a-z0-9_]+', name), 'Refusing a non-CI database'
            dsns[kind.lower()] = value
        assert dsns['fresh'] != dsns['upgrade'], 'Fresh and upgrade databases must be separate'
    source = str(ROOT / 'tools/dbcheck/main.go')
    for version, cwd in [('release', args.baseline_root), ('current', ROOT)]:
        run([env.get('GO', 'go'), 'build', '-o', str(out/version), source], cwd, env, out/f'{version}-build.log')

    def snapshot(version, kind, iteration, seed=False):
        label = f'{version}-{kind}-{iteration}'
        sqlite_path = str(out / f'{kind}.sqlite')
        state = dict(env, MATRIX_SEED='1' if seed else '0', MATRIX_SNAPSHOT=str(out/f'{label}.json'), MATRIX_SQLITE_PATH=sqlite_path)
        state['SQL_DSN'] = 'local' if args.engine == 'sqlite' else dsns[kind]
        run([str(out/version)], ROOT, state, out/f'{label}.log')
        return json.loads((out/f'{label}.json').read_text())

    if args.engine == 'sqlite':
        assert not (out/'fresh.sqlite').exists() and not (out/'upgrade.sqlite').exists(), 'Use a new output directory'
    for kind in ['fresh', 'upgrade']:
        state = dict(env, MATRIX_INSPECT_EMPTY='1', MATRIX_SQLITE_PATH=str(out/f'{kind}.sqlite'))
        state['SQL_DSN'] = 'local' if args.engine == 'sqlite' else dsns[kind]
        run([str(out/'current')], ROOT, state, out/f'{kind}-empty-check.log')
    old = snapshot('release', 'upgrade', 0, seed=True)
    results = []
    for kind in ['fresh', 'upgrade']:
        first = snapshot('current', kind, 1)
        second = snapshot('current', kind, 2)
        for field in ['counts', 'indexes', 'rows', 'sensitive_fixture_hashes']:
            assert first[field] == second[field], f'Restart changed {field}'
        if kind == 'fresh':
            assert all(count == 0 for table, count in first['counts'].items() if table != 'options'), 'Fresh DB contains business data'
            assert first['rows']['options'] and all(row['key'] == 'LegacyAccessTokenRetireAt' for row in first['rows']['options']), 'Unexpected fresh DB settings'
        else:
            compare(old, second)
            for token in second['rows']['tokens']:
                assert token['daily_budget'] == token['monthly_budget'] == 0
                assert not token['budget_reminder_enabled']
        for table in ['support_tickets', 'support_ticket_messages', 'affiliate_rewards', 'availability_incidents', 'availability_probe_samples']:
            assert second['counts'][table] == 0, f'Unexpected data in {table}'
        assert any(v['unique'] and v['columns'] == ['invited_user_id'] for v in second['indexes']['affiliate_rewards'])
        log = (out/f'current-{kind}-2.log').read_text()
        assert not re.search(r'\b(?:CREATE|ALTER|DROP)\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)[^\n]*(?:support_tickets|support_ticket_messages|affiliate_rewards|availability_(?:incidents|probe_samples)|tokens|midjourneys)', log, re.I), 'Repeated startup changed feature schema'
        results.append({'mode':kind,'startups':2,'result':'passed'})
    result = {'engine':args.engine,'baseline_tag':BASELINE_TAG,'baseline_commit':BASELINE,'checks':results,'sqlite_version':second['sqlite_version'],'schema_source_sha256':hashlib.sha256((ROOT/'model/main.go').read_bytes()).hexdigest()}
    (out/'result.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
