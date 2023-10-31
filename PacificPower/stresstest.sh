rm -rf logs
mkdir logs
for i in {1..20}; do node readPP.js --testing > logs/log-file$i.txt || (echo "Failed after $i attempts" && break); done