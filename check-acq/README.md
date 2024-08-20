## Check-Acq

Checks for Acquisuite and Pacific Power (not solar panel) meter status. Email alerts integrated for missing or unchanging data. Originally only checked for Acquisuite meters, hence the name.

- `node check-acq.js --<measurement> --save-output --debug-logs`
  - `--debug-logs` Optional argument, logs various data throughout the runtime (including meter times and data). Can be found in code by searching `DEBUG:` or `--debug-logs`.
  - `--save-output` Optional argument, saves output to `check-acq/mergedFinalDataOutput.json` or `check-acq/mergedFinalDataOutput.txt` (note that this output.json file is in .gitignore, it is not tracked on remote)
  - `--<measurement>` Optional argument. Choose `--negative`, `--nodata`, or `--nochange`. This restricts the script to only collect info on one specified measurement of negative data, missing data (`--nodata` flag), non-changing data
    - e.g. `node check-acq.js --negative --save-output` to filter for negative data only
    - Combining this with `--save-output` will add `Negative`, `NoData`, or `NoChange` to the output file name, e.g. `check-acq/mergedFinalDataOutputNegative.json`
    - Not providing the measurement argument will result in all measurements being collected
  - Sorted by meter ID (since summary section of output references them)
  - Meters with undefined meter group ID / meter ID / points are skipped
  - Duplicate meters are skipped
  - See `check-acq.js` code comments for more specific documentation of measurement collection logic, handling non-200 return code errors etc
- `node check-acq.js --all-meters`
  - `--all-meters` Optional argument. Do not include other arguments with this command. Gets all unique meters from allBuildings API call (except for meters that are in `blacklist.json`) and lists them as a flattened array of objects. Like the regular-acq script, uses `meter_id`, `building_id`, etc for more ease in searching
  - Sorted by building ID, then meter ID, like allBuildings API call
  - Meters with undefined meter group ID / meter ID / points are skipped
  - Duplicate meters are skipped
- `node check-acq.js --update-blacklist`
  - `--update-blacklist` Optional argument. Do not include other arguments with this command. Will automatically update
    `blacklist.json` by removing any blacklisted meters no longer found in allBuildings.json, and updating meter group, building hidden, and energy type info
  - Note that `meter_id` and `meter_note` must already exist in `blacklist.json` (e.g. if you want to add an entry). The other fields are auto-populated from allBuildings API call.
    - It doesn't work the other way around; there is no automation for _adding_ fields to `blacklist.json`, as it is left to user discretion how long a meter can be down before it can't be recovered
    - If a meter in the blacklist hasn't shown data for years, the best practice is to edit the "meter_group_relation" table in the SQL database to exclude that meter from any meter groups it is in
  - Sorted by building ID, then meter ID, like allBuildings API call
  - Duplicate meters are skipped
- `node format-allBuildings.js`

  - Reformat allbuildings api call (https://api.sustainability.oregonstate.edu/v2/energy/allbuildings) into a json file for reference
  - No other changes made to the data (unlike with check-acq.js)
  - Or use https://jsonformatter.org/ (with fullscreen button in upper right)

- Other debugging can be found by searching `DEBUG:`, which will have commented out code that can be uncommented to help with debugging by changing variables, logging, and shortening runtime by only running a few meters.
