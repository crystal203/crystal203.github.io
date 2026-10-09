const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'spine-webgl.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'equipment.js'), 'utf8'), context);
const { spine: s, GTEquipment: equipment } = context;
const texture = { setFilters() {}, setWraps() {}, getImage() { return { width: 256, height: 256 }; } };
const atlas = new s.TextureAtlas(fs.readFileSync(path.join(root, 'assets/character/hana.atlas'), 'utf8'), () => texture);
// Actual cwp_hana metadata from gtatlas/items.json. Test needs no sibling checkout.
const hanaFrame = {
  frame: { x: 415, y: 1878, w: 60, h: 56 }, rotated: false,
  spriteSourceSize: { x: 29, y: 7, w: 60, h: 56 }, sourceSize: { w: 90, h: 90 }
};
function character(view) {
  const data = new s.SkeletonBinary(new s.AtlasAttachmentLoader(atlas)).readSkeletonData(
    new Uint8Array(fs.readFileSync(path.join(root, `assets/character/hana_${view}.bytes`))));
  const skeleton = new s.Skeleton(data);
  skeleton.setSkinByName('hana_5');
  skeleton.setToSetupPose();
  const state = new s.AnimationState(new s.AnimationStateData(data));
  const injection = new equipment.Equipment(skeleton);
  const slot = skeleton.findSlot(`[base]weapon1_${view}`);
  const attachment = equipment.createAttachment(s, 'cwp_hana', hanaFrame, texture, 2048, 2048);
  return { data, skeleton, state, injection, slot, attachment };
}
function area(slot) {
  const vertices = new Float32Array(8);
  slot.getAttachment().computeWorldVertices(slot.bone, vertices, 0, 2);
  return Math.abs((vertices[2] - vertices[0]) * (vertices[7] - vertices[1])
    - (vertices[3] - vertices[1]) * (vertices[6] - vertices[0]));
}
test('Hana side: staff idle shows the scythe; idle collapses it without unequipping', () => {
  const { data, skeleton, state, injection, slot, attachment } = character('side');
  const originalSlotData = data.slots[slot.data.index];
  const mounted = injection.equip(slot, attachment);
  for (const [animation, visible] of [['staff_idle_side', true], ['idle_side', false], ['staff_idle_side', true]]) {
    state.setAnimation(0, animation, true);
    state.apply(skeleton);
    skeleton.updateWorldTransform();
    assert.equal(slot.getAttachment(), mounted);
    assert.equal(area(slot) > 1, visible);
  }
  assert.equal(originalSlotData.attachmentName, null, 'cached data stays immutable');
  injection.remove(slot);
  state.apply(skeleton);
  assert.equal(slot.data, originalSlotData);
  assert.equal(slot.getAttachment(), null);
});
test('equipment leaves animation draw order intact across every Hana side action', () => {
  const { data, skeleton, state, injection, slot, attachment } = character('side');
  const reference = new s.Skeleton(data);
  reference.setSkinByName('hana_5');
  const referenceState = new s.AnimationState(new s.AnimationStateData(data));
  injection.equip(slot, attachment);
  for (const animation of data.animations) {
    if (/^\[/.test(animation.name)) continue;
    skeleton.setToSetupPose();
    reference.setToSetupPose();
    state.clearTracks();
    referenceState.clearTracks();
    state.setAnimation(0, animation.name, true);
    referenceState.setAnimation(0, animation.name, true);
    for (const delta of [0, animation.duration / 2, animation.duration / 2]) {
      state.update(delta);
      referenceState.update(delta);
      state.apply(skeleton);
      referenceState.apply(reference);
      assert.deepEqual(Array.from(skeleton.drawOrder, x => x.data.name),
        Array.from(reference.drawOrder, x => x.data.name), animation.name);
    }
  }
});
test('logical weapon slot survives all views and skin changes; clear restores each slot', () => {
  const stored = { '[base]weapon1': 'cwp_hana' };
  for (const view of ['side', 'front', 'back', 'side']) {
    const { skeleton, state, injection, slot, attachment } = character(view);
    assert.equal(stored[equipment.slotKey(slot.data.name)], 'cwp_hana');
    const mounted = injection.equip(slot, attachment);
    skeleton.setSkinByName('hana_3');
    skeleton.setSlotsToSetupPose();
    state.setAnimation(0, `staff_idle_${view}`, true);
    state.apply(skeleton);
    skeleton.updateWorldTransform();
    assert.equal(slot.getAttachment(), mounted);
    assert.ok(area(slot) > 1, view);
    injection.clear();
    assert.equal(slot.getAttachment(), null);
  }
});
test('explicit attachment timeline null hides equipment and a named frame restores it', () => {
  const { skeleton, slot, injection, attachment } = character('side');
  const mounted = injection.equip(slot, attachment);
  const timeline = new s.AttachmentTimeline(2);
  timeline.slotIndex = slot.data.index;
  timeline.setFrame(0, 0, null);
  timeline.setFrame(1, 0.5, 'weapon');
  timeline.apply(skeleton, -1, 0.1, null, 1, s.MixBlend.replace, s.MixDirection.mixIn);
  assert.equal(slot.getAttachment(), null);
  timeline.apply(skeleton, 0.1, 0.6, null, 1, s.MixBlend.replace, s.MixDirection.mixIn);
  assert.equal(slot.getAttachment(), mounted);
});
test('the bundled WebGL skeleton renderer submits the equipped item texture', () => {
  const { skeleton, state, injection, slot } = character('side');
  const itemTexture = { item: true };
  injection.equip(slot, equipment.createAttachment(s, 'cwp_hana', hanaFrame, itemTexture, 2048, 2048));
  state.setAnimation(0, 'staff_idle_side', true);
  state.setAnimation(1, '[emo]idle_side', true);
  state.setAnimation(2, '[sub]idle_side', true);
  state.apply(skeleton);
  skeleton.updateWorldTransform();
  const textures = [];
  new s.webgl.SkeletonRenderer(null).draw({
    setBlendMode() {}, draw(texture) { textures.push(texture); }
  }, skeleton);
  assert.equal(textures.filter(texture => texture === itemTexture).length, 1);
  assert.ok(area(slot) > 1, 'default emote/sub tracks leave the weapon visible');
});
test('trim, pixel size and preferred item matching are preserved', () => {
  const { attachment } = character('side');
  assert.equal(attachment.width, 90);
  assert.equal(attachment.height, 90);
  assert.equal(attachment.scaleY, -1);
  assert.equal(attachment.region.offsetX, 29);
  assert.equal(attachment.region.offsetY, 27);
  assert.equal(attachment.region.renderObject.texture, texture, 'WebGL renderer resolves the item texture');
  assert.equal(equipment.isPreferredItem('cwp_adelanoble', 'adela_noble'), true);
  assert.equal(equipment.isPreferredItem('cwp_adela_noble', 'adela_noble'), true);
  assert.equal(equipment.isPreferredItem('cwp_hana_beachball', 'hana'), false);
});

test('Hana scythe handle points down and blade points left in staff idle', () => {
  const { skeleton, state, injection, slot, attachment } = character('side');
  const mounted = injection.equip(slot, attachment);
  state.setAnimation(0, 'staff_idle_side', true);
  state.apply(skeleton);
  skeleton.updateWorldTransform();
  function sourcePoint(x, y) {
    const radians = mounted.rotation * Math.PI / 180;
    const localX = (x - 45) * mounted.scaleX;
    const localY = (45 - y) * mounted.scaleY;
    const bx = localX * Math.cos(radians) - localY * Math.sin(radians);
    const by = localX * Math.sin(radians) + localY * Math.cos(radians);
    return { x: slot.bone.a * bx + slot.bone.b * by, y: slot.bone.c * bx + slot.bone.d * by };
  }
  const hand = sourcePoint(45, 45), handleEnd = sourcePoint(29, 61);
  assert.ok(handleEnd.y < hand.y);
  assert.ok(Math.abs(handleEnd.x - hand.x) < Math.abs(handleEnd.y - hand.y) * 0.3);
  const bladeBase = sourcePoint(70, 18), bladeTip = sourcePoint(88, 63);
  assert.ok(bladeTip.x < bladeBase.x);
  assert.equal(attachment.rotation, 0, 'the shared item attachment stays unchanged');
});

test('axis reflection uses each bind rotation and leaves unrelated slots alone', () => {
  const { skeleton, injection, attachment } = character('side');
  const slot = skeleton.findSlot('[base]weapon1_side');
  // Exercise different authored axes instead of asserting a fixed 90-degree correction.
  const originalData = slot.bone.data;
  for (const rotation of [-30, -45, 20]) {
    slot.bone.data = Object.assign(Object.create(Object.getPrototypeOf(originalData)), originalData, { rotation });
    const mounted = injection.equip(slot, attachment);
    const angle = rotation * Math.PI / 180, correction = mounted.rotation * Math.PI / 180;
    const x = 7, y = 3;
    const actualX = x * Math.cos(angle + correction) + y * Math.sin(angle + correction);
    const actualY = x * Math.sin(angle + correction) - y * Math.cos(angle + correction);
    // Reflect in weapon-parent space, after applying the child's bind rotation.
    const expectedX = x * Math.cos(angle) - y * Math.sin(angle);
    const expectedY = -(x * Math.sin(angle) + y * Math.cos(angle));
    assert.ok(Math.abs(actualX - expectedX) < 1e-6);
    assert.ok(Math.abs(actualY - expectedY) < 1e-6);
    injection.remove(slot);
  }
  slot.bone.data = originalData;
  const body = skeleton.findSlot('[base]body');
  assert.equal(injection.equip(body, attachment).rotation, 0);
});

test('view inheritance remaps three tracks, keeps disabled tracks, and handles trailing animation markers', () => {
  for (const view of ['front', 'back', 'side']) {
    const { data } = character(view);
    const names = Array.from(data.animations, animation => animation.name);
    assert.equal(equipment.inheritAnimation(names, 'staff_idle_side', view, `idle_${view}`), `staff_idle_${view}`);
    const smile = `[emo]smile_${view}`;
    assert.equal(equipment.inheritAnimation(names, '[emo]smile_side', view, ''), names.includes(smile) ? smile : '');
    assert.equal(equipment.inheritAnimation(names, '[sub]idle_side', view, ''), `[sub]idle_${view}`);
  }
  assert.equal(equipment.inheritAnimation(['bow_attack_front[full]'], 'bow_attack_side[full]', 'front', ''), 'bow_attack_front[full]');
  assert.equal(equipment.inheritAnimation(['dagger_idle_front2'], 'dagger_idle_side2', 'front', ''), 'dagger_idle_front2');
  assert.equal(equipment.inheritAnimation(['idle_back'], '', 'back', 'idle_back'), '');
  assert.equal(equipment.inheritAnimation(['idle_back'], 'missing_side', 'back', 'idle_back'), 'idle_back');
  assert.equal(equipment.inheritAnimation(['special'], 'special', 'back', 'idle_back'), 'special');
});
