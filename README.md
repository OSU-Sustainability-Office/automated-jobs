# automated-jobs:
Containerized CRON jobs written in Node v.12 for the Sustainability Office.

## Architecture
Basically, each automated-job is described through a dockerfile (containerized) then will be uploaded to an image registry (AWS ECR).
Through the AWS Management Console we define Scheduled Tasks which run each container on a random node in a Cluster of AWS-managed VMs (or 
whatever AWS calls them).


## Current Job Status:
 - **TeslaSolarCity** Deployed: Uploaded to ECR & running daily on ECS.
 - **SunnyWebBox** (Not Deployed): Can't access web-box without VPN access.

## Important References for development
 - [Scheduled Tasks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/scheduled_tasks.html)
 - [Blogpost](https://aws.amazon.com/blogs/containers/deploy-applications-on-amazon-ecs-using-docker-compose/)
 - [AWS Fargate](https://aws.amazon.com/fargate/getting-started/)
 - [AWS ECS guide](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html) 
 - [Docker guide for Node](https://docs.docker.com/language/nodejs/)
 - [Docker w/ ECS](https://docs.docker.com/cloud/ecs-integration/)