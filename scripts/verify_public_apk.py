#!/usr/bin/env python3
"""Validate the published APK capability without printing it or changing menu data."""
import json
import re
import urllib.error
import urllib.request
import zipfile

with zipfile.ZipFile('downloads/Rabel-Gestione.apk') as apk:
    if apk.testzip() is not None:
        raise RuntimeError('Invalid APK archive')
    capability = apk.read('assets/capability.js').decode('utf-8')
match = re.search(r"'([0-9a-f]{64})'", capability)
if not match:
    raise RuntimeError('APK capability missing')
base = 'https://mpspdmjvjkqsssxgbxkm.supabase.co/functions/v1/rabel-app/'
def request(path, method='GET', data=None):
    headers = {'x-rabel-app-key':match.group(1)}
    if data is not None:
        headers.update({'Content-Type':'application/json','Prefer':'return=representation'})
        data = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req,timeout=20) as response:
        return json.loads(response.read())
dishes = request('rest/v1/rabel_dishes?select=id,name&order=id.asc&limit=1')
if len(dishes) != 1:
    raise RuntimeError('Expected one dish')
dish = dishes[0]
updated = request('rest/v1/rabel_dishes?id=eq.'+str(dish['id']), 'PATCH', {'name':dish['name']})
if len(updated) != 1 or updated[0]['name'] != dish['name']:
    raise RuntimeError('No-op write did not return the original name')
print('APK capability: read and no-op write verified')
