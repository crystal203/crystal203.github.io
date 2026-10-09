/* Equipment uses existing slots: draw order, clipping, tint and bone visibility
   remain under the control of the skeleton's animation timelines. */
(function (root) {
  "use strict";

  function slotKey(name) {
    return name.replace(/_(front|back|side|tentacle)$/i, "");
  }

  function isPreferredItem(item, character) {
    function normalize(value) { return value.toLowerCase().replace(/_/g, ""); }
    return normalize(item) === "cwp" + normalize(character || "");
  }

  function inheritAnimation(names, wanted, view, fallback) {
    if (wanted === "") return "";
    var directed = view ? wanted.replace(/_(front|back|side|tentacle)(\d*(?:\[[^\]]*\])?)$/, "_" + view + "$2") : wanted;
    if (names.indexOf(directed) >= 0) return directed;
    if (names.indexOf(wanted) >= 0) return wanted;
    return fallback;
  }

  function createAttachment(spine, name, frame, texture, sheetWidth, sheetHeight) {
    var rect = frame.frame;
    var size = frame.sourceSize || { w: rect.w, h: rect.h };
    var source = frame.spriteSourceSize || { x: 0, y: 0, w: rect.w, h: rect.h };
    var attachment = new spine.RegionAttachment(name);
    // TexturePacker's trim origin is top-left; Spine's offset is bottom-left.
    attachment.setRegion({
      texture: texture,
      u: rect.x / sheetWidth, v: rect.y / sheetHeight,
      u2: (rect.x + rect.w) / sheetWidth, v2: (rect.y + rect.h) / sheetHeight,
      width: source.w, height: source.h,
      originalWidth: size.w, originalHeight: size.h,
      offsetX: source.x, offsetY: size.h - source.y - source.h,
      rotate: !!frame.rotated
    });
    attachment.width = size.w;
    attachment.height = size.h;
    attachment.region.renderObject = attachment.region;
    // Item sprites use the reflected coordinate system of the game binding.
    // Equipment.equip converts that reflection into the selected slot's axes.
    attachment.scaleY = -1;
    attachment.updateOffset();
    return attachment;
  }

  function Equipment(skeleton) {
    this.skeleton = skeleton;
    this.bindings = Object.create(null);
    var bindings = this.bindings;
    var original = skeleton.getAttachment;
    skeleton.getAttachment = function (index, name) {
      return bindings[index] ? bindings[index].attachment : original.call(this, index, name);
    };
  }

  Equipment.prototype.equip = function (slot, attachment) {
    // Weapon slots often sit on an axis child (e.g. b.w1_axis / item1_side),
    // whose setup rotation converts the parent weapon coordinates. Reflection
    // and rotation do not commute: R(axis) F != F R(axis). Conjugate the
    // reflection into the slot frame, using its actual bind rotation, rather
    // than adding a constant angle to every weapon / view / animation.
    var bone = slot.bone;
    if (bone.parent && /weapon/i.test(bone.parent.data.name) && attachment.scaleY < 0) {
      attachment = attachment.copy();
      attachment.rotation -= 2 * bone.data.rotation;
      attachment.updateOffset();
    }
    var index = slot.data.index;
    if (!this.bindings[index]) {
      var originalData = slot.data;
      // Never mutate shared SkeletonData: it is also used by cached skeletons.
      slot.data = Object.assign(Object.create(Object.getPrototypeOf(originalData)), originalData);
      if (slot.data.attachmentName == null) slot.data.attachmentName = "__equipment__";
      this.bindings[index] = { slot: slot, originalData: originalData };
    }
    this.bindings[index].attachment = attachment;
    slot.setAttachment(attachment);
    return attachment;
  };

  Equipment.prototype.remove = function (slot) {
    var binding = this.bindings[slot.data.index];
    if (!binding) return;
    delete this.bindings[slot.data.index];
    slot.data = binding.originalData;
    slot.setToSetupPose();
  };

  Equipment.prototype.clear = function () {
    var self = this;
    Object.keys(this.bindings).forEach(function (index) { self.remove(self.bindings[index].slot); });
  };

  root.GTEquipment = {
    Equipment: Equipment, slotKey: slotKey,
    isPreferredItem: isPreferredItem, createAttachment: createAttachment,
    inheritAnimation: inheritAnimation
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
