const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
for (const file of ['spine-webgl.js', 'emotion.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const { spine: s, GTEmotion: emotion } = context;
function data(folder, atlasName, bytesName, size) {
  const texture = { setFilters() {}, setWraps() {}, getImage() { return { width: size, height: size }; } };
  const atlas = new s.TextureAtlas(fs.readFileSync(path.join(root, 'assets', folder, atlasName + '.atlas'), 'utf8'), () => texture);
  return new s.SkeletonBinary(new s.AtlasAttachmentLoader(atlas)).readSkeletonData(
    new Uint8Array(fs.readFileSync(path.join(root, 'assets', folder, bytesName + '.bytes'))));
}
const advanced = data('emotion', 'human_emotion', 'human_emotion', 128);
const views = Object.fromEntries(['front', 'side', 'back'].map(view => [view, data('character', 'hana', 'hana_' + view, 256)]));
const names = d => Array.from(d.animations, animation => animation.name);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);

test('all 17 advanced expressions resolve front/side and use the native empty face', () => {
  const choices = new Set(names(advanced).map(emotion.key).filter(name => name !== 'empty'));
  assert.equal(choices.size, 17);
  for (const expression of choices) {
    for (const view of ['front', 'side']) {
      const route = emotion.route(names(views[view]), names(advanced), expression, view);
      assert.equal(route.native, '[emo]empty_' + view);
      assert.equal(route.advanced, expression + '_' + view);
    }
  }
});

test('native and advanced choices survive back without rendering any face track', () => {
  for (const choice of ['smile', 'love', 'cry', 'empty', '']) {
    const front = emotion.route(names(views.front), names(advanced), choice, 'front');
    const back = emotion.route(names(views.back), names(advanced), choice, 'back');
    assert.equal(back.native, '');
    assert.equal(back.advanced, '');
    const side = emotion.route(names(views.side), names(advanced), choice, 'side');
    assert.equal(emotion.key(side.advanced || side.native), emotion.key(front.advanced || front.native));
    const restored = emotion.route(names(views.front), names(advanced), choice, 'front');
    assert.equal(restored.native, front.native);
    assert.equal(restored.advanced, front.advanced);
  }
});

test('a missing direction never reuses a facial animation from another view', () => {
  assert.equal(emotion.resolve(['love_front'], 'love', 'side'), '');
  assert.equal(emotion.resolve(['[emo]idle_front2', '[emo]idle_side2'], 'idle2', 'side'), '[emo]idle_side2');
});

function scene(view) {
  const character = new s.Skeleton(views[view]);
  character.setSkinByName('hana_5');
  character.setToSetupPose();
  character.updateWorldTransform();
  const overlay = new emotion.Overlay(s, character, advanced);
  overlay.select('love_' + view);
  return { character, overlay };
}

test('the bind frame removes face setup rotation rather than adding a fixed angle', () => {
  for (const view of ['front', 'side']) {
    const { character, overlay } = scene(view);
    assert.equal(overlay.face.data.name, '[base]face', 'prefer face over the earlier head bone');
    near(overlay.face.data.rotation, -90);
    overlay.update();
    const bone = overlay.skeleton.bones[0];
    near(bone.a, 1); near(bone.b, 0); near(bone.c, 0); near(bone.d, 1);
    near(bone.worldX, overlay.face.worldX); near(bone.worldY, overlay.face.worldY);
    assert.equal(character.findBone('[base]head') === overlay.face, false);
  }
});

test('overlays follow animated face rotation, character zoom, movement and reflection', () => {
  const { character, overlay } = scene('side');
  for (const scaleX of [1, 3, -3]) {
    character.scaleX = scaleX;
    character.scaleY = 3;
    character.x = 110;
    character.y = -80;
    overlay.face.rotation = overlay.face.data.rotation + 25;
    character.updateWorldTransform();
    overlay.update();
    const rootBone = overlay.skeleton.bones[0];
    near(rootBone.worldX, overlay.face.worldX); near(rootBone.worldY, overlay.face.worldY);
    const inv = overlay.inverse, f = overlay.face;
    near(rootBone.a, f.a * inv.a + f.b * inv.c);
    near(rootBone.c, f.c * inv.a + f.d * inv.c);
    const eye = overlay.skeleton.findBone('eyeRB');
    assert.ok(Number.isFinite(eye.worldX) && Number.isFinite(eye.worldY));
    const firstX = eye.worldX, firstY = eye.worldY;
    overlay.update();
    near(eye.worldX, firstX); near(eye.worldY, firstY); // drawing twice for alpha/export does not compound transforms
  }
});

test('changing expression resets old overlays, and export steps advance its animation', () => {
  const { overlay } = scene('front');
  overlay.select('cry_front');
  assert.equal(overlay.state.getCurrent(0).trackTime, 0);
  overlay.state.update(0.1);
  overlay.update();
  near(overlay.state.getCurrent(0).trackTime, 0.1);
  assert.ok(overlay.skeleton.slots.some(slot => slot.getAttachment()));
  overlay.select('');
  assert.equal(overlay.update(), false);
  overlay.select('love_front');
  assert.equal(overlay.state.getCurrent(0).trackTime, 0);
  assert.equal(overlay.update(), true);
});
