@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js табылмады. https://nodejs.org/ сайтынан LTS нұсқасын орнатыңыз.
  echo Орнатқаннан кейін осы файлды қайта ашыңыз.
  pause
  exit /b 1
)
echo Электр Lab сервері іске қосылады.
echo Бұл терезені ойын аяқталғанша жаппаңыз.
node server.cjs
pause
