@echo off
cd /d d:\ScriptWeaver
echo [%date% %time%] Build started > _pack_out.txt
call npx electron-builder --win --publish=never >> _pack_out.txt 2>&1
echo [%date% %time%] Build finished >> _pack_out.txt
