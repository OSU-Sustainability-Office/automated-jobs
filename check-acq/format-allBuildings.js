const fs = require("fs");
const axios = require("axios");
const apiUrl = "https://api.sustainability.oregonstate.edu/v2/energy/allbuildings"

axios
  .get(apiUrl)
  .then((response) => {
    if (response.status === 200) {
      const input = response.data;

      console.log("Acquisuite Data Checker\n");

      const jsonContent = JSON.stringify(input, null, 2);
      fs.writeFile(
        `allBuildings.json`,
        jsonContent,
        "utf8",
        function (err) {
          if (err) {
            return console.log(err);
          }
          console.log("See formatted output in allBuildings.json");
        },
      );

      // Do something with the 'requests' array if needed.
    } else {
      console.error("Failed to fetch data from the API.");
    }
  })
  .catch((error) => {
    console.error("An error occurred while fetching data:", error);
  });
