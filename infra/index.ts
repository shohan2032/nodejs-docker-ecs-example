import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import AWS from "aws-sdk";

const cfg = new pulumi.Config(); // use pulumi config for reusable values
const region = cfg.require("aws:region"); // e.g. "us-east-1"
AWS.config.update({ region });

const sm = new AWS.SecretsManager({ region });

/** helper: list all Secrets Manager secrets and return those with names starting with prefix */
async function listSecretsForPrefix(prefix: string) {
  const res: { Name: string; ARN: string }[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const out = await sm.listSecrets({ MaxResults: 100, NextToken: nextToken }).promise();
    for (const s of out.SecretList || []) {
      if (s.Name && s.Name.startsWith(prefix)) {
        res.push({ Name: s.Name!, ARN: s.ARN! });
      }
    }
    nextToken = out.NextToken;
  } while (nextToken);
  return res;
}

/** create or update service (task def) using secrets discovered by prefix convention */
async function createOrUpdateService(params: {
  name: string;                // logical name, e.g. "auth"
  image: string;               // full image URI (ECR)
  cpu: string;                 // "512"
  memory: string;              // "1024"
  port: number;
}) {
  const { name, image, cpu, memory, port } = params;
  const prefix = `${name}/`; // secret names MUST start with e.g. "auth/..."
  const secrets = await listSecretsForPrefix(prefix);

  // Build ECS secrets array for task definition: { name: ENV_NAME, valueFrom: secretArn }
  // If secret name is "auth/DB_URL", env name -> "DB_URL"
  const ecsSecrets = secrets.map(s => {
    const envName = s.Name!.substring(prefix.length); // e.g. "DB_URL"
    return { name: envName, valueFrom: s.ARN };
  });

  // Create new task definition (Fargate)
  const taskDef = new aws.ecs.TaskDefinition(`${name}-task`, {
    family: name,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu,
    memory,
    executionRoleArn: cfg.require("EXECUTION_ROLE_ARN"),
    taskRoleArn: cfg.require("TASK_ROLE_ARN"),
    containerDefinitions: JSON.stringify([{
      name,
      image,
      portMappings: [{ containerPort: port, protocol: "tcp" }],
      // put secrets here (valueFrom is ARN)
      secrets: ecsSecrets,
      // other container definitions (environment, log config) can be added here
    }]),
  });

  // ECS cluster (assume cluster exists; import or reference by name)
  const clusterName = cfg.require("ECS_CLUSTER_NAME");
  const cluster = aws.ecs.Cluster.get("cluster", clusterName);

  // Create (or re-create) service resource in Pulumi; if already imported Pulumi will manage it.
  new aws.ecs.Service(`${name}-service`, {
    cluster: cluster.arn,
    taskDefinition: taskDef.arn,
    desiredCount: 2,
    launchType: "FARGATE",
    networkConfiguration: {
      subnets: [
        cfg.require("SUBNET_ID_1"),
        cfg.require("SUBNET_ID_2"),
      ],
      assignPublicIp: true,
      securityGroups: [cfg.require("SECURITY_GROUP_ID")],
    },
    forceNewDeployment: true,
  });

  return;
}

/** --- main: define services --- */
(async () => {
  // Replace the image names with your ECR image URIs (you can also make them Pulumi config values)
  await createOrUpdateService({
    name: "auth",
    image: cfg.require("AUTH_IMAGE"),
    cpu: "512",
    memory: "1024",
    port: 3333,
  });

  await createOrUpdateService({
    name: "main-api",
    image: cfg.require("MAIN_API_IMAGE"),
    cpu: "256",
    memory: "1024",
    port: 3333,
  });

  await createOrUpdateService({
    name: "payment",
    image: cfg.require("PAYMENT_IMAGE"),
    cpu: "256",
    memory: "1024",
    port: 3333,
  });

  await createOrUpdateService({
    name: "dashboard",
    image: cfg.require("DASHBOARD_IMAGE"),
    cpu: "1024",
    memory: "1536",
    port: 3000,
  });
})();
