// save-output.js

const fs = require("fs");

function saveOutputToFile(data, outputPath, outputFormat) {
  // Convert the data to JSON if needed
  let dataToWrite =
    outputFormat === "json" ? JSON.stringify(data, null, 2) : data;

  fs.writeFile(outputPath, dataToWrite, (err) => {
    if (err) {
      console.error("Error writing file:", err);
    } else {
      console.log(`Data saved to ${outputPath}`);
    }
  });
}

module.exports = {
  saveOutputToFile,
};
