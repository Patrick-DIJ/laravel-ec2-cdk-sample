import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import rds = require('@aws-cdk/aws-rds');
import secretsManager = require('@aws-cdk/aws-secretsmanager');
import ssm = require('@aws-cdk/aws-ssm');

interface DBProps extends cdk.StackProps {
    serviceName: string;
    databaseUsername: string;
    vpc: ec2.IVpc;
}

export class DBStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: DBProps) {
        super(scope, id);

        const databaseCredentialsSecret = new secretsManager.Secret(this, 'DBCredentialsSecret', {
            secretName: `${props.serviceName}-credentials`,
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    username: props.databaseUsername,
                }),
                excludePunctuation: true,
                includeSpace: false,
                generateStringKey: 'password'
            }
        });

        new ssm.StringParameter(this, 'DBCredentialsArn', {
            parameterName: `${props.serviceName}-credentials-arn`,
            stringValue: databaseCredentialsSecret.secretArn,
        });

        const subnetIds: string[] = [];
        props.vpc.isolatedSubnets.forEach(subnet => {
            subnetIds.push(subnet.subnetId);
        });

        const dbSubnetGroup = new rds.CfnDBSubnetGroup(this, 'AuroraSubnetGroup', {
            dbSubnetGroupDescription: 'Subnet group to access aurora',
            dbSubnetGroupName: `${props.serviceName}aurora-db-subnet-group`,
            subnetIds
        });

        const rdsCluster = new rds.CfnDBCluster(this, 'DBCluster', {
            engine: 'aurora',
            engineMode: 'serverless',
            masterUsername: databaseCredentialsSecret.secretValueFromJson('username').toString(),
            masterUserPassword: databaseCredentialsSecret.secretValueFromJson('password').toString(),
            deletionProtection: false,
            dbSubnetGroupName: dbSubnetGroup.dbSubnetGroupName,
        });

        rdsCluster.addDependsOn(dbSubnetGroup);

        const dbClusterArn = `arn:aws:rds:${this.region}:${this.account}:cluster:${rdsCluster.ref}`;

        new ssm.StringParameter(this, 'DBResourceArn', {
            parameterName: `${props.serviceName}-resource-arn`,
            stringValue: dbClusterArn,
        });
    }
}