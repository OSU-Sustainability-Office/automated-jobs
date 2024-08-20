# automated-jobs:

Containerized CRON jobs written in Node v.18 for the Sustainability Office.

## Architecture

Basically, each automated-job is described through a dockerfile (containerized) then will be uploaded to an image registry (AWS ECR).
Through the AWS Management Console we define Scheduled Tasks which run each container on a random node in a Cluster of AWS-managed VMs (or
whatever AWS calls them).

## Currently Active Jobs
All console commands below should be run from the directory unless stated otherwise, e.g. do `cd SEC` before `node readSEC.js`. See `README` in each folder for flags that can be run for each job (e.g. `--save-output` or `--no-upload`).

- **SEC** (Deployed): Retrieves some solar panel data from Student Experience Center. Email alerts integrated for failed upload.
  - `node readSEC.js`
- **ennex-os** (Deployed): Retrieves some solar panel data from OSU Operations. Email alerts integrated for failed upload.
  - `node readEnnex.js`
- **Check-Acq** (Deployed): Checks for Acquisuite and Pacific Power (not solar panel) meter status. Email alerts integrated for missing or unchanging data.
  - `node check-acq.js`

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
