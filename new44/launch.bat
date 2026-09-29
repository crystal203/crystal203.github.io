@echo off
setlocal
rem ============================================================
rem  圆形角斗场模拟器 - 本地启动脚本
rem
rem  站点根必须是「仓库根目录」（即 new44 的上一级），
rem  因为 new44/index.html 里的玩家查询会用 iframe 去取
rem  ../gt.html 来算练度。若把根设在 new44 目录内，
rem  ../gt.html 会落到站点根之外，练度就会显示 N/A。
rem  这与部署到 GitHub Pages 时的目录结构一致。
rem ============================================================

cd /d "%~dp0.."

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY (
    where py >nul 2>nul && set "PY=py -3"
)
if not defined PY (
    echo [错误] 未找到 python，请先安装 Python 并加入 PATH。
    pause
    exit /b 1
)

set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%/new44/index.html"

echo 站点根目录 : %CD%
echo 启动地址   : %URL%
echo 停止服务器 : 关闭标题为 "new44-server" 的窗口
echo.

start "new44-server" cmd /k "%PY% -m http.server %PORT% --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "%URL%"

endlocal
