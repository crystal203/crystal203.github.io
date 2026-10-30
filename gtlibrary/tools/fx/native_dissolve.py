"""The two visible native dissolve passes have different vertex color inputs."""
import hashlib

def two_pass_contract(shader, passes, value):
    if hashlib.sha256(bytes(shader.compressedBlob)).hexdigest()!='fc04be905251f40c37aab8621c2ee47a80f68eedd7b132e8426a5ed926c56207':
        raise ValueError('Unreviewed native two-pass dissolve program: inspect every source vertex/fragment before accepting')
    if len(passes)!=2:raise ValueError('Native dissolve requires exactly two source passes')
    output=[]
    for i,p in enumerate(passes):
        state=p.m_State;blend=state.rtBlend0
        if value(state.culling)!=(2 if i==0 else 1) or value(state.zWrite)!=0 or value(state.zTest)!=4:
            raise ValueError('Changed native dissolve cull/depth contract')
        if value(blend.blendOp)!=0 or value(blend.blendOpAlpha)!=0 or value(blend.colMask)!=15:
            raise ValueError('Changed native dissolve blend operation/color mask')
        output.append({'nativeBlend':[value(blend.srcBlend),value(blend.destBlend)],
            'cull':'back' if i==0 else 'front','depthWrite':False,'depthTest':True,
            'dissolvePass':i+1,'colorInput':'vertex.rgb' if i==0 else 'custom2.rgb',
            'alphaInput':'main.r > custom1.x'})
    return {'surface':'particleDissolveTwoPass','nativePasses':output,
        'nativeShaderContract':{'version':1,'compressedBlobSha256':hashlib.sha256(bytes(shader.compressedBlob)).hexdigest(),
            'vertexProgramIndices':[p.progVertex.m_PlayerSubPrograms[0][0].m_BlobIndex for p in passes]}}

def contract_issues(mat):
    errors=[];passes=mat.get('nativePasses',[])
    if mat.get('surface')!='particleDissolveTwoPass' or len(passes)!=2:return ['missing native two-pass dissolve contract']
    for i,p in enumerate(passes):
        if p.get('cull')!=('back' if i==0 else 'front') or p.get('dissolvePass')!=i+1 or p.get('depthWrite') is not False:
            errors.append('incorrect native dissolve pass '+str(i))
        if p.get('alphaInput')!='main.r > custom1.x' or p.get('colorInput')!=('vertex.rgb' if i==0 else 'custom2.rgb'):
            errors.append('incorrect native dissolve vertex/alpha input '+str(i))
        if p.get('nativeBlend')!=mat.get('nativeBlend'):errors.append('native dissolve pass blend differs')
    if not mat.get('nativeShaderContract',{}).get('compressedBlobSha256'):errors.append('missing native dissolve shader provenance')
    return errors
