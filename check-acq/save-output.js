const fs = require("fs");

function saveOutputToFile(dataObj, outputPath, outputFormat) {
  // Convert the data to JSON if needed
  let dataToWrite =
    outputFormat === "json" ? JSON.stringify(dataObj, null, 2) : dataObj;

  fs.writeFileSync(outputPath, dataToWrite, (err) => {
    if (err) {
      console.error("Error writing file:", err);
    } else {
      // I'm not sure this console.log works anymore after changing it from writeFile to writeFileSync (due to async issues with writefile)
      console.log(`Data saved to ${outputPath}`);
    }
  });
}

module.exports = {
  saveOutputToFile,
};
