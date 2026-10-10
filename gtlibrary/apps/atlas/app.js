let currentSpritesheet = null;
        let loadGeneration=0, loadAbort=null;
        let allRegions = [];
        let filteredRegions = [];
        let currentPage = 1;
        let zhNames = {};
        const itemsPerPage = 12;
        let searchOptions = {
            caseSensitive: true,
            exactMatch: false,
            regexMatch: false
        };

        // `zh` is an optional sidecar of {internalCode: 中文名}; when present the
        // Chinese name is shown first and is searchable alongside the internal code
        let spritesheets = [];

        document.addEventListener('DOMContentLoaded', async function() {
            try { spritesheets = (await GTResourceCatalog.load()).sheets; } catch(error) { document.getElementById('emptyState').textContent=error.message;document.getElementById('emptyState').style.display='block';return; }
            populateSpritesheetSelector();
            const params=new URLSearchParams(location.search),sheet=params.get('sheet');
            if(sheet){const position=spritesheets.findIndex(s=>s.json.endsWith('/'+sheet+'.json'));if(position>=0){document.getElementById('spritesheetSelect').value=String(position);loadSpritesheet();}}
            document.getElementById('imageInput').addEventListener('change', handleFileUpload);
            document.getElementById('jsonInput').addEventListener('change', handleFileUpload);
            document.getElementById('advancedSearchModal').addEventListener('click', function(e) {
                if (e.target === this) closeAdvancedSearch();
            });
        });

        function populateSpritesheetSelector() {
            const select = document.getElementById('spritesheetSelect');
            select.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '— 请选择图集 —';
            select.appendChild(placeholder);

            spritesheets.forEach((sheet, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = sheet.name;
                select.appendChild(option);
            });
        }

        async function loadSpritesheet() {
            const index = document.getElementById('spritesheetSelect').value;
            const generation=++loadGeneration; loadAbort?.abort(); loadAbort=new AbortController(); const signal=loadAbort.signal;
            if (index === '') {
                currentSpritesheet = null;
                allRegions = filteredRegions = [];
                zhNames = {};
                renderRegionList();
                renderPagination();
                return;
            }

            showLoading(true);
            try {
                const sheet = spritesheets[index];

                const [jsonData, names, img] = await Promise.all([
                    GTResources.fetch(sheet.json,{signal}).then(response=>{if(!response.ok)throw new Error('HTTP '+response.status);return response.json();}),
                    sheet.zh ? GTResources.fetch(sheet.zh,{signal}).then(response=>response.ok?response.json():{}).catch(error=>{if(signal.aborted)throw error;return {};}) : {},
                    GTResources.image(sheet.png,{signal})
                ]);
                if(generation!==loadGeneration)return;
                zhNames=names;
                currentSpritesheet = { ...sheet, img };
                allRegions = filterBlankRegions(parseSpritesheetData(jsonData, img), img);
                for (const region of allRegions) region.zh = zhNames[region.name] || '';
                filteredRegions = [...allRegions];
                const target=new URLSearchParams(location.search).get('query');
                if(target)document.getElementById('searchInput').value=target;
                filterRegions();
                showLoading(false);
            } catch (error) {
                if(generation!==loadGeneration||error.name==='AbortError')return;
                console.error('加载图集失败:', error);
                alert('加载图集失败: ' + error.message);
                showLoading(false);
            }
        }

        const parseSpritesheetData=GTAtlasCore.parse, filterBlankRegions=GTAtlasCore.filterVisible, drawRegion=GTAtlasCore.draw;
        function makeThumbnail(region) {
            // cap the preview so a 1000px-wide frame does not allocate a full-size
            // canvas and a multi-megabyte data URL just for a 56px box
            const scale = Math.min(1, 128 / Math.max(region.w, region.h, 1));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(region.w * scale));
            canvas.height = Math.max(1, Math.round(region.h * scale));
            drawRegion(canvas.getContext('2d'), region.img, region, canvas.width, canvas.height);
            return canvas.toDataURL();
        }

        function renderRegionList() {
            const regionList = document.getElementById('regionList');
            const emptyState = document.getElementById('emptyState');

            if (!currentSpritesheet) {
                regionList.innerHTML = '';
                regionList.style.display = 'none';
                emptyState.style.display = 'none';
                return;
            }

            if (filteredRegions.length === 0) {
                regionList.style.display = 'none';
                emptyState.style.display = 'block';
                return;
            }

            regionList.style.display = 'grid';
            emptyState.style.display = 'none';

            const startIndex = (currentPage - 1) * itemsPerPage;
            const pageRegions = filteredRegions.slice(startIndex, startIndex + itemsPerPage);

            regionList.innerHTML = '';
            pageRegions.forEach(region => {
                const item = document.createElement('div');
                item.className = 'region-item';

                const thumb = document.createElement('img');
                thumb.className = 'region-image';
                thumb.src = makeThumbnail(region);
                thumb.alt = region.zh || region.name;
                thumb.loading = 'lazy';

                const info = document.createElement('div');
                info.className = 'region-info';

                // the Chinese name wins; the internal code stays underneath as the
                // thing you would actually reference or search for
                const nameEl = document.createElement('div');
                nameEl.className = 'region-name';
                nameEl.textContent = region.zh || region.name;
                nameEl.title = region.zh ? `${region.zh}  ·  ${region.name}` : region.name;

                const subParts = [];
                if (region.zh) subParts.push(region.name);
                if (region.rotated) subParts.push('已旋转');

                info.appendChild(nameEl);
                if (subParts.length) {
                    const metaEl = document.createElement('div');
                    metaEl.className = 'region-meta';
                    metaEl.textContent = subParts.join(' · ');
                    info.appendChild(metaEl);
                }

                const btn = document.createElement('button');
                btn.className = 'download-btn';
                btn.textContent = '下载';
                // downloaded files keep the internal code, which stays unique
                btn.addEventListener('click', () => downloadRegion(region));

                item.appendChild(thumb);
                item.appendChild(info);
                const actions=document.createElement("div");actions.className="region-actions";actions.append(btn);item.append(actions);

                const sheetCode=String(currentSpritesheet.json||'').split('/').pop().replace('.json','');
                if(['characters','portraits','bosses'].includes(sheetCode)){
                    const selection={name:region.name,sheet:sheetCode,query:region.name};
                    const entity=GTRegistry.resolve(globalThis.GTLibraryRegistry||{aliases:{},entities:{}},selection);
                    if(entity){
                      for(const view of ['spine','fx'])if(entity[view]){const jump=document.createElement('button');jump.className='download-btn';jump.textContent=view==='spine'?'像素动画':'特效';jump.onclick=()=>GTBridge.navigate(view,selection,view==='spine'&&sheetCode==='characters'&&entity.spine.folder==='character'?{name:region.name,folder:'character'}:{});actions.append(jump);}
                      if(entity.illust){const jump=document.createElement('button');jump.className='download-btn';jump.textContent='立绘';jump.onclick=()=>GTBridge.navigate('spine',selection,entity.illust);actions.append(jump);}
                    }
                }

                regionList.appendChild(item);
            });
        }

        function renderPagination() {
            const pagination = document.getElementById('pagination');
            pagination.innerHTML = '';

            const totalPages = Math.ceil(filteredRegions.length / itemsPerPage);
            if (!currentSpritesheet || totalPages <= 1) {
                pagination.style.display = 'none';
                return;
            }

            pagination.style.display = 'flex';

            const addBtn = (label, page, opts = {}) => {
                const btn = document.createElement('button');
                btn.className = 'page-btn' + (opts.active ? ' active' : '');
                btn.textContent = label;
                btn.disabled = !!opts.disabled;
                if (!opts.disabled && !opts.active) btn.onclick = () => changePage(page);
                pagination.appendChild(btn);
            };

            addBtn('‹', currentPage - 1, { disabled: currentPage === 1 });

            for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
                    addBtn(String(i), i, { active: i === currentPage });
                } else if (Math.abs(i - currentPage) === 3) {
                    const gap = document.createElement('span');
                    gap.className = 'page-gap';
                    gap.textContent = '…';
                    pagination.appendChild(gap);
                }
            }

            addBtn('›', currentPage + 1, { disabled: currentPage === totalPages });
        }

        function changePage(page) {
            const totalPages = Math.ceil(filteredRegions.length / itemsPerPage);
            if (page >= 1 && page <= totalPages) {
                currentPage = page;
                renderRegionList();
                renderPagination();
                document.getElementById('regionList').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        // 与 gtasset 的联动目标。
        // 换算很简单：立绘在 gtasset 里就是本表帧名加个 illust_ 前缀，角色名两边完全一致。
        //   portraits.png  帧 adela_noble  ->  ../gtasset/index.html?folder=illust&name=illust_adela_noble
        //   characters.png 帧 adela_noble_3 ->  ../gtasset/index.html?folder=character&name=adela_noble_3
        // 两个项目在同一仓库、同一站点根下，所以用相对路径 ../gtasset/。
        function downloadRegion(region) {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, region.w);
            canvas.height = Math.max(1, region.h);
            drawRegion(canvas.getContext('2d'), region.img, region, canvas.width, canvas.height);

            const link = document.createElement('a');
            link.download = region.name + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        }

        function showLoading(show) {
            document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
        }

        async function handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const uploadStatus = document.getElementById('uploadStatus');
            uploadStatus.textContent = `已选择: ${file.name}`;

            if (file.name.toLowerCase().endsWith('.png')) {
                window.uploadedImage = URL.createObjectURL(file);
                checkAndLoadUploadedFiles();
            } else if (file.name.toLowerCase().endsWith('.json')) {
                try {
                    window.uploadedJson = JSON.parse(await file.text());
                    checkAndLoadUploadedFiles();
                } catch (error) {
                    alert('JSON文件格式错误: ' + error.message);
                }
            }
            event.target.value = '';
        }

        function checkAndLoadUploadedFiles() {
            if (!window.uploadedImage || !window.uploadedJson) return;

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function() {
                currentSpritesheet = { img: img, name: '上传的图集' };
                allRegions = filterBlankRegions(parseSpritesheetData(window.uploadedJson, img), img);
                filteredRegions = [...allRegions];
                currentPage = 1;
                document.getElementById('spritesheetSelect').value = '';
                renderRegionList();
                renderPagination();

                document.getElementById('uploadStatus').textContent = '';
                window.uploadedImage = null;
                window.uploadedJson = null;
            };
            img.onerror = function() {
                alert('加载上传的图片失败');
            };
            img.src = window.uploadedImage;
        }

        function filterRegions() {
            const searchTerm = document.getElementById('searchInput').value;

            if (!searchTerm.trim()) {
                filteredRegions = [...allRegions];
            } else {
                // a region matches on its internal code OR its Chinese name, so both
                // "admiral" and "海军" find the same portrait
                const test = (text) => {
                    if (!text) return false;
                    if (searchOptions.regexMatch) {
                        try {
                            return new RegExp(searchTerm, searchOptions.caseSensitive ? '' : 'i').test(text);
                        } catch (e) {
                            return false;
                        }
                    }
                    if (searchOptions.exactMatch) {
                        return searchOptions.caseSensitive
                            ? text === searchTerm
                            : text.toLowerCase() === searchTerm.toLowerCase();
                    }
                    return searchOptions.caseSensitive
                        ? text.includes(searchTerm)
                        : text.toLowerCase().includes(searchTerm.toLowerCase());
                };

                filteredRegions = allRegions.filter(region => test(region.name) || test(region.zh));
            }

            currentPage = 1;
            renderRegionList();
            renderPagination();
            if(currentSpritesheet){const sheet=String(currentSpritesheet.json||'').split('/').pop().replace('.json','');const params=new URLSearchParams(location.search);const selection={sheet,query:searchTerm};if(params.get('query')===searchTerm&&params.get('resource'))selection.resource=params.get('resource');GTBridge.selection(selection);}
        }

        function showAdvancedSearch() {
            document.getElementById('advancedSearchModal').style.display = 'flex';
        }

        function closeAdvancedSearch() {
            document.getElementById('advancedSearchModal').style.display = 'none';
        }

        function applyAdvancedSearch() {
            searchOptions.caseSensitive = document.getElementById('caseSensitive').checked;
            searchOptions.exactMatch = document.getElementById('exactMatch').checked;
            searchOptions.regexMatch = document.getElementById('regexMatch').checked;
            closeAdvancedSearch();
            filterRegions();
        }
window.addEventListener("gt-dispose",()=>{++loadGeneration;loadAbort?.abort();});

GTRegistry.load().then(()=>{if(currentSpritesheet)renderRegionList();}).catch(error=>console.debug(error));
