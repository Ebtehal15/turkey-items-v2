@echo off
cd /d "c:\Users\DeLL\Desktop\cilii"
echo === Git Status ===
git status
echo.
echo === Adding all files ===
git add -A
git status
echo.
echo === Commit ===
git commit -m "Push all changes" || echo (Nothing to commit or commit failed)
echo.
echo === Push to GitHub ===
git push origin main
echo.
echo === Done. Press any key to close. ===
pause
