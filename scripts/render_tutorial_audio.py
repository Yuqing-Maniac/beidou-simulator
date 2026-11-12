import json,wave,subprocess,hashlib,time
from pathlib import Path
import sherpa_onnx as s
import argparse,tempfile
parser=argparse.ArgumentParser(description='Render bundled Chinese tutorial narration using Kokoro v1.1-zh and sherpa-onnx.')
parser.add_argument('--model-dir',type=Path,required=True,help='Directory containing model.int8.onnx, voices.bin and lexicons')
model=parser.parse_args().model_dir
Path('public/tutorial/audio').mkdir(parents=True,exist_ok=True)
workspace=Path(tempfile.mkdtemp(prefix='beichen-narration-'))
config=s.OfflineTtsConfig(model=s.OfflineTtsModelConfig(kokoro=s.OfflineTtsKokoroModelConfig(model=str(model/'model.int8.onnx'),voices=str(model/'voices.bin'),tokens=str(model/'tokens.txt'),lexicon=str(model/'lexicon-us-en.txt')+','+str(model/'lexicon-zh.txt'),),num_threads=2),rule_fsts=','.join(str(model/f) for f in ['date-zh.fst','number-zh.fst','phone-zh.fst']),max_num_sentences=1)
assert config.validate()
tts=s.OfflineTts(config)
chapters=json.loads(Path('src/tutorial-data.json').read_text());manifest=[]
cache_path=Path('public/tutorial/audio/manifest.json')
cached={x['id']:x for x in json.loads(cache_path.read_text())} if cache_path.exists() else {}
for c in chapters:
 if c['id'] in cached and cached[c['id']]['textSha256']==hashlib.sha256(c['narration'].encode()).hexdigest() and (Path('public/tutorial/audio')/cached[c['id']]['file']).exists():
  manifest.append(cached[c['id']]);print('cached',c['id'],flush=True);continue
 start=time.time();audio=tts.generate(c['narration'],sid=3,speed=1.0)
 import numpy as np
 samples=(np.clip(audio.samples,-1,1)*32767).astype(np.int16)
 wav=workspace/(c['id']+'-speech.wav')
 with wave.open(str(wav),'wb') as w:w.setparams((1,2,audio.sample_rate,0,'NONE','not compressed'));w.writeframes(samples.tobytes())
 mp3=Path('public/tutorial/audio')/(c['id']+'.mp3')
 subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(wav),'-c:a','libmp3lame','-b:a','64k',str(mp3)],check=True)
 manifest.append(dict(id=c['id'],file=mp3.name,duration=round(len(samples)/audio.sample_rate,3),textSha256=hashlib.sha256(c['narration'].encode()).hexdigest(),audioSha256=hashlib.sha256(mp3.read_bytes()).hexdigest()))
 Path('public/tutorial/audio/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(c['id'],manifest[-1]['duration'],'sec; rendered',round(time.time()-start,1),flush=True)
Path('public/tutorial/audio/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
