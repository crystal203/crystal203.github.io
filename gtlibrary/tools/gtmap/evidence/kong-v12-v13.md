# KONG v12/v13 container evidence

Source: E:/GTFiles/dump/_disasm/TilemapBinary_ReadFromStream.txt (native game disassembly).

- Difficulty entry begins at v12.
- Water entry begins at v15; addon entries at v16.
- 0x76386912de88: compare version against 0xd, branch when less. upperFloors is present only from v13.
- 0x76386912e1ec: compare version against 0xe. mergedUpperWalls and nonUnitUpperWalls are present only from v14.
- floors, mergedWalls and nonUnitSizedWalls remain present from v12.

Both strict_kong.py and decoder.js use these gates. Absent arrays consume zero bytes. All deployed maps must reach exact EOF and match SHA-256 and tile counts. Unknown component payloads remain raw; this evidence does not claim every component has been interpreted.
