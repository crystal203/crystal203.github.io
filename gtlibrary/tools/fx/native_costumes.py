"""Read native CostumeOverrideData's literal Lua table without executing Lua."""
import ast,hashlib,json,re
from pathlib import Path
TOKEN=re.compile(r"\s+|--\[\[[\s\S]*?\]\]|--[^\n]*|'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*|[{}\[\]=,;]")
def parse_literal_table(text):
 tokens=[];pos=0
 for m in TOKEN.finditer(text):
  if text[pos:m.start()].strip():raise ValueError('Unsupported Lua syntax: '+text[pos:m.start()])
  pos=m.end();v=m.group()
  if not v.isspace() and not v.startswith('--'):tokens.append(v)
 if text[pos:].strip():raise ValueError('Unparsed Lua suffix')
 i=0
 def expect(token):
  nonlocal i
  if tokens[i]!=token:raise ValueError(f'Expected {token}, got {tokens[i]}')
  i+=1
 def value():
  nonlocal i
  token=tokens[i];i+=1
  if token=='{':
   keyed={};array=[]
   while tokens[i]!='}':
    if tokens[i]=='[':
     i+=1;key=value();expect(']');expect('=');keyed[str(key)]=value()
    elif i+1<len(tokens) and tokens[i+1]=='=':
     key=tokens[i];i+=2;keyed[key]=value()
    else:array.append(value())
    if tokens[i] in [',',';']:i+=1
    elif tokens[i]!='}':raise ValueError('Missing Lua table separator')
   i+=1
   if keyed and array:raise ValueError('Mixed keyed/array table')
   return keyed if keyed or not array else array
  if token[0] in "'\"":return ast.literal_eval(token)
  if token in ['true','false','nil']:return {'true':True,'false':False,'nil':None}[token]
  if re.fullmatch(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',token):return float(token) if any(c in token for c in '.eE') else int(token)
  if token.startswith('CS.'):return token
  raise ValueError('Unsupported Lua value '+token)
 expect('return');result=value()
 if i!=len(tokens):raise ValueError('Extra Lua tokens')
 return result

def collect_costume_overrides(config,items,origins):
 path=Path(config.get('costumeOverrideSource') or Path(config['scriptRoot'])/'CostumeOverrideData.lua')
 if not path.is_file():raise FileNotFoundError('Configure costumeOverrideSource: '+str(path))
 raw=path.read_text(encoding='utf-8-sig');table=parse_literal_table(raw);costumes={}
 for item in items:
  if item.get('Type') not in ['costume','supercostume'] or not origins.intersection(item.get('TargetCharacterIds',[])):continue
  override=table.get(str(item['Id']))
  if not override:continue
  assets=item.get('AssetName') or {};asset=assets.get('default') if isinstance(assets,dict) else assets
  appearance=re.split('[#:]',asset or item['Name'])[0]
  costumes[appearance]={'id':item['Id'],'name':item['Name'],'type':item['Type'],'special':bool(item.get('IsSpecial')),
   'overrides':{k:v for k,v in override.items() if k in ['battleactions','battlestyles','options','projectiles']}}
 return costumes,{'file':str(path),'sha256':hashlib.sha256(raw.encode()).hexdigest()}
