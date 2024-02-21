const LOG_AMOUNT = 5;

// see all ecs containers: aws logs describe-log-groups --log-group-name-prefix "/ecs"
const ECS_CONTAINER = "/ecs/collect-ennex-data";
// manually get stream info (example): aws logs describe-log-streams --log-group-name "/ecs/collect-check-acq" --order-by LastEventTime --descending
// manually get logs for specific stream (example): aws logs get-log-events --log-group-name /ecs/collect-check-acq --log-stream-name ecs/check-acq-container/4379d84b43f04b188c97017de0f09bc3 --output text > a.log

// When output files are sorted alphabetically A-Z (ascending), the log file at the bottom is most recent log file

const fs = require("fs");
const { execSync } = require("child_process");
let getStreams = execSync(
  `aws logs describe-log-streams --log-group-name ${ECS_CONTAINER} --order-by LastEventTime --descending`
);
// console.log(test.toString())
console.log(JSON.parse(getStreams.toString()).logStreams.slice(0, LOG_AMOUNT));
let recentStreams = JSON.parse(getStreams.toString()).logStreams.slice(
  0,
  LOG_AMOUNT
);
let inputFileNames = [];
for (let i = 0; i < recentStreams.length; i++) {
  const replacedString =
    recentStreams[i].lastEventTimestamp +
    "-" +
    recentStreams[i].logStreamName.replace(/\//g, "_");
  execSync(
    `aws logs get-log-events --log-group-name ${ECS_CONTAINER} --log-stream-name ${recentStreams[i].logStreamName} --start-time ${recentStreams[i].firstEventTimestamp} --end-time ${recentStreams[i].lastIngestionTime} --output text > ${replacedString}.log`
  );
  inputFileNames.push(`${replacedString}.log`);
}
function removeFirstLineAndTimestamps(inputFile) {
  fs.readFile(inputFile, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading file:", err);
      return;
    }

    // Split the file content into lines
    const lines = data.split("\n");

    // Remove the first line
    lines.shift();

    // Remove timestamps and "EVENTS" from each line
    const modifiedLines = lines.map((line) => {
      // Remove 13 digit Unix timestamps
      const timestampRegex = /\s?\b\d{13}\b\s?/g;
      line = line.replace(timestampRegex, "");

      // Remove "EVENTS"
      line = line.replace(/EVENTS/g, "");

      return line.trimEnd(); // Trim any leading/trailing whitespace
    });

    // Join the modified lines back together
    const modifiedContent = modifiedLines.join("\n");

    // Write the modified content back to the file
    fs.writeFile("formatted-" + inputFile, modifiedContent, "utf8", (err) => {
      if (err) {
        console.error("Error writing file:", err);
        return;
      }
      console.log("File processing completed successfully.");
    });
  });
}

for (let i = 0; i < inputFileNames.length; i++) {
  removeFirstLineAndTimestamps(inputFileNames[i]);
}
