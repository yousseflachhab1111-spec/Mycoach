#!/usr/bin/env python3
"""Usage: python embed_audio.py audio/  ->  prints JS to paste in the HTML (replace HUMAN_VOICE_EMBEDDED = ...)."""
import sys, os, base64, json
d = sys.argv[1] if len(sys.argv) > 1 else 'audio'
out = {f[:-4]: 'data:audio/mpeg;base64,' + base64.b64encode(open(os.path.join(d, f), 'rb').read()).decode()
       for f in sorted(os.listdir(d)) if f.endswith('.mp3')}
print('window.HUMAN_VOICE_EMBEDDED = ' + json.dumps(out) + ';')
