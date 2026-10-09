/* Facial overlays share the expression picker with native character tracks. */
(function (root) {
  "use strict";

  function key(name) {
    return name.replace(/^\[emo\]/, "").replace(/_(front|back|side|tentacle)(?=\d*(?:\[[^\]]*\])?$)/, "");
  }

  function resolve(names, expression, view) {
    if (!expression) return "";
    var matches = names.filter(function (name) { return key(name) === expression; });
    var directed = matches.find(function (name) { return name.indexOf("_" + view) >= 0; });
    return directed || matches.find(function (name) { return name === expression || name === "[emo]" + expression; }) || "";
  }

  function route(nativeNames, advancedNames, expression, view) {
    // Keep the chosen expression outside the resolved track: back has no face.
    if (view === "back") return { native: "", advanced: "" };
    var advanced = expression !== "empty" && resolve(advancedNames, expression, view);
    if (advanced) return { native: resolve(nativeNames, "empty", view), advanced: advanced };
    return { native: resolve(nativeNames, expression, view), advanced: "" };
  }

  function findFace(skeleton) {
    return skeleton.findBone("face") || skeleton.findBone("[base]face")
      || skeleton.bones.find(function (bone) { return /face/i.test(bone.data.name); })
      || skeleton.bones.find(function (bone) { return /head/i.test(bone.data.name); });
  }

  function Overlay(spine, character, data) {
    this.face = findFace(character);
    this.skeleton = new spine.Skeleton(data);
    this.skeleton.setToSetupPose();
    this.state = new spine.AnimationState(new spine.AnimationStateData(data));
    this.animation = "";
    // Remove the whole bind frame, including the face's setup rotation. Copying
    // its local rotation (often -90 degrees) turns expressions sideways.
    var setup = new spine.Skeleton(character.data);
    setup.setToSetupPose();
    setup.updateWorldTransform();
    var face = this.face && setup.findBone(this.face.data.name);
    var det = face ? face.a * face.d - face.b * face.c : 0;
    this.inverse = det ? { a: face.d / det, b: -face.b / det, c: -face.c / det, d: face.a / det } : null;
  }

  Overlay.prototype.select = function (animation) {
    if (this.animation === animation) return;
    this.animation = animation;
    this.state.clearTracks();
    this.skeleton.setToSetupPose();
    if (animation) this.state.setAnimation(0, animation, true);
  };

  Overlay.prototype.update = function () {
    if (!this.animation || !this.face || !this.inverse) return false;
    this.state.apply(this.skeleton);
    this.skeleton.updateWorldTransform();
    var f = this.face, inv = this.inverse;
    var a = f.a * inv.a + f.b * inv.c, b = f.a * inv.b + f.b * inv.d;
    var c = f.c * inv.a + f.d * inv.c, d = f.c * inv.b + f.d * inv.d;
    this.skeleton.bones.forEach(function (bone) {
      var x = bone.worldX, y = bone.worldY;
      var ba = bone.a, bb = bone.b, bc = bone.c, bd = bone.d;
      bone.worldX = f.worldX + a * x + b * y;
      bone.worldY = f.worldY + c * x + d * y;
      bone.a = a * ba + b * bc; bone.b = a * bb + b * bd;
      bone.c = c * ba + d * bc; bone.d = c * bb + d * bd;
    });
    return true;
  };

  root.GTEmotion = { key: key, resolve: resolve, route: route, findFace: findFace, Overlay: Overlay };
})(typeof globalThis !== "undefined" ? globalThis : this);
