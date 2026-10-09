(function(global){
        function parseSpritesheetData(data, img) {
            const regions = [];
            const push = (name, frame, rotated) => {
                regions.push({
                    name: name,
                    x: frame.x || 0,
                    y: frame.y || 0,
                    w: frame.w || frame.width || 0,
                    h: frame.h || frame.height || 0,
                    rotated: !!rotated,
                    zh: '',
                    img: img
                });
            };

            const frames = data.frames;

            if (Array.isArray(frames)) {
                frames.forEach((frame, index) => {
                    push(frame.name || `region_${index}`, frame.frame || frame, frame.rotated);
                });
            } else if (frames && typeof frames === 'object') {
                for (const regionName in frames) {
                    const frameData = frames[regionName];
                    push(regionName, frameData.frame || frameData, frameData.rotated);
                }
            }

            return regions;
        }

        // Drop fully transparent frames on load - that covers both spare padding and
        // the game's deliberate 1x1 "no sprite" placeholders (items/empty,
        // characters/big_boss, portraits/bounty_hunter).
        // One full-image read plus an alpha prefix sum answers "is this rect empty?"
        // in O(1) per frame, so even the 2858-frame items atlas is a single pass.
        function filterBlankRegions(regions, img) {
            if (!regions.length) return regions;

            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);

            let pixels;
            try {
                pixels = ctx.getImageData(0, 0, width, height).data;
            } catch (e) {
                // tainted canvas: show everything rather than nothing
                return regions;
            }

            const stride = width + 1;
            const sums = new Uint32Array(stride * (height + 1));
            for (let y = 0; y < height; y++) {
                let rowHits = 0;
                const rowStart = y * stride;
                const nextStart = rowStart + stride;
                for (let x = 0; x < width; x++) {
                    if (pixels[(y * width + x) * 4 + 3] !== 0) rowHits++;
                    sums[nextStart + x + 1] = sums[rowStart + x + 1] + rowHits;
                }
            }

            const visible = [];
            for (const region of regions) {
                // a rotated frame is stored turned 90 degrees, so its packed
                // footprint is the transpose of its display size
                const packedW = region.rotated ? region.h : region.w;
                const packedH = region.rotated ? region.w : region.h;
                const x0 = Math.max(0, region.x);
                const y0 = Math.max(0, region.y);
                const x1 = Math.min(width, region.x + packedW);
                const y1 = Math.min(height, region.y + packedH);

                let hits = 0;
                if (x1 > x0 && y1 > y0) {
                    hits = sums[y1 * stride + x1] - sums[y0 * stride + x1]
                         - sums[y1 * stride + x0] + sums[y0 * stride + x0];
                }

                if (hits > 0) visible.push(region);
            }

            return visible;
        }

        // Draw one sprite into a canvas sized to its display (un-rotated) size.
        // `rotated` means the atlas holds it turned 90 degrees clockwise inside an
        // (h x w) rect, so it is drawn back through a 90 degree counter-clockwise turn.
        // Smoothing is always off: the art is pixel art, so any resampling would
        // blur it. The CSS side matches with `image-rendering: pixelated`.
        function drawRegion(ctx, img, region, targetW, targetH) {
            ctx.imageSmoothingEnabled = false;
            if (region.rotated) {
                ctx.save();
                ctx.translate(0, targetH);
                ctx.rotate(-Math.PI / 2);
                ctx.drawImage(img, region.x, region.y, region.h, region.w, 0, 0, targetH, targetW);
                ctx.restore();
            } else {
                ctx.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, targetW, targetH);
            }
        }


global.GTAtlasCore={parse:parseSpritesheetData,filterVisible:filterBlankRegions,draw:drawRegion};
})(globalThis);
