Remove-Item 'logs'
New-Item -Name "logs" -ItemType Directory
for ($i = 1 ; $i -le 20 ; $i++){node readPP.js --testing > logs/log-file$i.txt}