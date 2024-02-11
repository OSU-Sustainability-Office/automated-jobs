# automated-jobs:

Containerized CRON jobs written in Node v.18 for the Sustainability Office.

## Architecture

Basically, each automated-job is described through a dockerfile (containerized) then will be uploaded to an image registry (AWS ECR).
Through the AWS Management Console we define Scheduled Tasks which run each container on a random node in a Cluster of AWS-managed VMs (or
whatever AWS calls them).

## Currently Active Jobs
All console commands below should be run from the directory unless stated otherwise, e.g. do `cd SEC` before `node readSEC.js`

- **SEC** (Deployed): Retrieves some solar panel data from Student Experience Center. Email alerts integrated for failed upload.
  - `node readSEC.js`
- **ennex-os** (Deployed): Retrieves some solar panel data from OSU Operations. Email alerts integrated for failed upload.
  - `node readEnnex.js`
- **Check-Acq** (Deployed): Checks for Acquisuite (not solar panel) meter status. Email alerts integrated for missing or unchanging data.
  - `node check-acq.js --<measurement> --save-output`
    - `--save-output` Optional argument, saves output to `check-acq/mergedFinalDataOutput.json` or `check-acq/mergedFinalDataOutput.txt` (note that this output.json file is in .gitignore, it is not tracked on remote)
    - `--<measurement>` Optional argument. Choose `--negative`, `--nodata`, or `--nochange`. This restricts the script to only collect info on one specified measurement of negative data, missing data (`--nodata` flag), non-changing data
      - e.g. `node check-acq.js --negative --save-output` to filter for negative data only
      - Combining this with `--save-output` will add `Negative`, `NoData`, or `NoChange` to the output file name, e.g. `check-acq/mergedFinalDataOutputNegative.json`
      - Not providing the measurement argument will result in all measurements being collected
    - Sorted by meter ID (since summary section of output references them)
    - Meters with undefined meter group ID / meter ID / points are skipped
    - Duplicate meters are skipped
    - See `check.acq.js` code comments for more specific documentation of measurement collection logic, handling non-200 return code errors etc
  - `node check-acq.js --all-meters`
    - `all-meters` Optional argument. Do not include other arguments with this command. Gets all unique meters from allBuildings API call (except for meters that are in `blacklist.json`) and lists them as a flattened array of objects. Like the regular-acq script, uses `meter_id`, `building_id`, etc for more ease in searching
    - Sorted by building ID, then meter ID, like allBuildings API call
    - Meters with undefined meter group ID / meter ID / points are skipped
    - Duplicate meters are skipped
  - `node check-acq.js --update-blacklist`
    - `--update-blacklist` Optional argument. Do not include other arguments with this command. Will automatically update 
    `blacklist.json` by removing any blacklisted meters no longer found in allBuildings.json, and updating meter group, building hidden, and energy type info
    - Note that `meter_id` and `meter_note` must already exist in `blacklist.json` (e.g. if you want to add an entry). The other fields are auto-populated from allBuildings API call.
      - It doesn't work the other way around; there is no automation for *adding* fields to `blacklist.json`, as it is left to user discretion how long a meter can be down before it can't be recovered
      - If a meter in the blacklist hasn't shown data for years, the best practice is to edit the "meter_group_relation" table in the SQL database to exclude that meter from any meter groups it is in
    - Sorted by building ID, then meter ID, like allBuildings API call
    - Duplicate meters are skipped
  - `node format-allBuildings.js`
    - Reformat allbuildings api call (https://api.sustainability.oregonstate.edu/v2/energy/allbuildings) into a json file for reference
    - No other changes made to the data (unlike with check-acq.js)
    - Or use https://jsonformatter.org/ (with fullscreen button in upper right)

## Deprecated

- **TeslaSolarCity** (Not Deployed): This webscraper is deprecated due to Tesla deprecation of service, now we are using iframes on a different public endpoint also provided by Tesla.
- **SunnyWebBox** (Not Deployed): Can't access web-box without VPN access.

## Important References for development

- [Scheduled Tasks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/scheduled_tasks.html)
- [Blogpost](https://aws.amazon.com/blogs/containers/deploy-applications-on-amazon-ecs-using-docker-compose/)
- [AWS Fargate](https://aws.amazon.com/fargate/getting-started/)
- [AWS ECS guide](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html)
- [Docker guide for Node](https://docs.docker.com/language/nodejs/)
- [Docker w/ ECS](https://docs.docker.com/cloud/ecs-integration/)
- [PuppeteerJS Webscraper](https://pptr.dev/)
- [AWS Cloudwatch Alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
- [AWS SNS Email Alerts](https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html)
