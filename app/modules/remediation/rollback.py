from datetime import datetime
from botocore.exceptions import ClientError
from app.database.db import get_db
from sqlalchemy.orm import Session
from app.database.models import Execution
from app.database.db import SessionLocal
from fastapi import Depends
import json
from app.utils.json_utils import extract_metadata
from app.core.aws_session import AWSSession
from app.database.models import Rollback
from sqlalchemy import text
import uuid 

class RollbackEngine:

    def __init__(self, aws_session):
        self.aws_session = aws_session

    def _log_rollback(self, db, execution_id, status):
        try:
            print("LOGGING ROLLBACK →", execution_id, status)

            db.add(Rollback(
                id=str(uuid.uuid4()), 
                execution_id=execution_id,
                status=status,
                created_at=datetime.utcnow()
            ))
            db.commit()

            print("ROLLBACK LOG SUCCESS")

        except Exception as e:
            db.rollback()
            print("ROLLBACK LOG ERROR →", str(e))

    def _success(self, db, execution_id, payload):
        self._log_rollback(db, execution_id, "ROLLBACK_SUCCESS")
        return payload

    def _fail(self, db, execution_id, reason):
        self._log_rollback(db, execution_id, "FAILED")
        return {
            "status": "FAILED",
            "reason": reason
        }

    def rollback(self, execution_id):
        db = SessionLocal()
        try:

            row = db.query(Execution).filter(
                Execution.execution_id == execution_id
            ).first()

            if not row:
                return {
                    "status": "FAILED",
                    "reason": "Execution ID not found in DB"
                }


            action = row.action
            metadata = row.meta if isinstance(row.meta, dict) else {}

            resource_id = (
                metadata.get("user_name") or
                metadata.get("bucket_name") or
                metadata.get("resource_id") or
                row.resource_name
            )

            # =====================================================
            # IAM ROLLBACK (ADMIN POLICY)
            # =====================================================
            if action == "DETACH_ADMIN_POLICY":

                try:
                    iam = self.aws_session.session.client("iam")

                    iam.attach_user_policy(
                        UserName=resource_id,
                        PolicyArn="arn:aws:iam::aws:policy/AdministratorAccess"
                    )

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "action": action,
                        "resource_id": resource_id,
                        "timestamp": datetime.utcnow().isoformat()
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            # -----------------------------------
            # INLINE POLICY DELETE ROLLBACK
            # -----------------------------------
            if action == "REMOVE_INLINE_POLICY":

                inner = extract_metadata(row)

                user_name = inner.get("user_name")
                policies = inner.get("policies", [])

                user_name = metadata.get("user_name")
                policies = metadata.get("policies", [])

                if not user_name or not policies:
                    return self._fail(db, execution_id, "No backup policies found")

                iam = self.aws_session.session.client("iam")

                restored = 0

                try:
                    for policy in policies:
                        iam.put_user_policy(
                            UserName=user_name,
                            PolicyName=policy["policy_name"],
                            PolicyDocument=json.dumps(policy["document"])
                        )
                        restored += 1

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "action": action,
                        "user_name": user_name,
                        "restored_policies": restored
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            # =====================================================
            # SECURITY GROUP ROLLBACK
            # =====================================================
            if action == "RESTRICT_SECURITY_GROUP":

                inner = extract_metadata(row)

                revoked_rules = inner.get("revoked_rules")

                resource_id = (
                    inner.get("resource_id") or
                    inner.get("security_group_id")
                )

                region = inner.get("region")

                if not resource_id:
                    return self._fail(db, execution_id, "Missing security group ID in metadata")

                if not revoked_rules:
                    return self._fail(db, execution_id, "No revoked rules stored")

                ec2 = self.aws_session.session.client("ec2", region_name=region)

                ec2.authorize_security_group_ingress(
                    GroupId=resource_id,
                    IpPermissions=revoked_rules
                )

                return self._success(db, execution_id, {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id
                })
        
            # -----------------------------------
            # S3 VERSIONING ROLLBACK
            # -----------------------------------
            if action == "ENABLE_S3_VERSIONING":

                inner = extract_metadata(row)

                bucket_name = inner.get("bucket_name")
                previous_status = inner.get("previous_versioning_status")

                print("EXTRACTED:", bucket_name, previous_status)

                if not bucket_name:
                    return self._fail(db, execution_id, "Missing bucket_name in metadata")

                s3 = self.aws_session.session.client("s3")

                if previous_status in ["Enabled", "Suspended"]:
                    s3.put_bucket_versioning(
                        Bucket=bucket_name,
                        VersioningConfiguration={"Status": previous_status}
                    )
                else:
                    s3.put_bucket_versioning(
                        Bucket=bucket_name,
                        VersioningConfiguration={"Status": "Suspended"}
                    )

                return self._success(db, execution_id, {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id,
                    "bucket_name": bucket_name,
                    "restored_to": previous_status
                })


            # -----------------------------------
            # S3 BLOCK PUBLIC ACCESS ROLLBACK
            # -----------------------------------
            if action == "ENABLE_BLOCK_PUBLIC_ACCESS":

                inner = extract_metadata(row)

                bucket_name = inner.get("bucket_name")
                previous_config = inner.get("previous_public_access_block")

                if not bucket_name or not previous_config:
                    return self._fail(db, execution_id, "Missing metadata for rollback")

                s3 = self.aws_session.session.client("s3")

                s3.put_public_access_block(
                    Bucket=bucket_name,
                    PublicAccessBlockConfiguration=previous_config
                )

                return self._success(db, execution_id, {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id,
                    "bucket_name": bucket_name,
                    "restored_config": previous_config
                })

            # -----------------------------------
            # S3 PUBLIC ACL ROLLBACK
            # -----------------------------------
            if action == "REMOVE_PUBLIC_S3_ACL":

                inner = extract_metadata(row)

                bucket_name = inner.get("bucket_name")
                previous_acl = inner.get("previous_acl")
                owner = inner.get("owner")  # ⚠️ may be missing currently

                if not bucket_name or not previous_acl:
                    return self._fail(db, execution_id, "Missing ACL metadata for rollback")

                s3 = self.aws_session.session.client("s3")

                try:
                    s3.put_bucket_acl(
                        Bucket=bucket_name,
                        AccessControlPolicy={
                            "Grants": previous_acl,
                            "Owner": owner or {"ID": previous_acl[0]["Grantee"].get("ID", "")}
                        }
                    )

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "bucket_name": bucket_name
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            # -----------------------------------
            # S3_Access_Logging
            # -----------------------------------

            if action == "ENABLE_S3_ACCESS_LOGGING":

                inner = extract_metadata(row)

                bucket_name = inner.get("bucket_name")
                previous_logging = inner.get("previous_logging")

                # ✅ STEP 1 — NEW (extract these)
                log_bucket = inner.get("target_bucket")
                previous_policy = inner.get("previous_policy")

                s3 = self.aws_session.session.client("s3")

                # -----------------------------------
                # Restore logging
                # -----------------------------------
                if previous_logging:
                    s3.put_bucket_logging(
                        Bucket=bucket_name,
                        BucketLoggingStatus={
                            "LoggingEnabled": previous_logging
                        }
                    )
                else:
                    # disable logging
                    s3.put_bucket_logging(
                        Bucket=bucket_name,
                        BucketLoggingStatus={}
                    )

                # -----------------------------------
                # Restore bucket policy (STEP 2 — NEW)
                # -----------------------------------
                if log_bucket:
                    try:
                        if previous_policy:
                            s3.put_bucket_policy(
                                Bucket=log_bucket,
                                Policy=previous_policy
                            )
                        else:
                            s3.delete_bucket_policy(Bucket=log_bucket)
                    except Exception as e:
                        return self._fail(db, execution_id, f"Policy rollback failed: {str(e)}")

                return self._success(db, execution_id, {
                    "status": "ROLLBACK_SUCCESS",
                    "execution_id": execution_id,
                    "bucket_name": bucket_name
                })


            # -----------------------------------
            # IAM ACCESS KEY ROLLBACK
            # -----------------------------------
            if action == "DISABLE_ACCESS_KEY":

                inner = extract_metadata(row)

                user_name = inner.get("user_name")
                access_key_id = inner.get("access_key_id")
                previous_status = inner.get("previous_status")

                if not user_name or not access_key_id:
                    return self._fail(db, execution_id, "Missing access key metadata")

                iam = self.aws_session.session.client("iam")

                try:
                    iam.update_access_key(
                        UserName=user_name,
                        AccessKeyId=access_key_id,
                        Status=previous_status or "Active"
                    )

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "user_name": user_name,
                        "access_key_id": access_key_id,
                        "restored_status": previous_status
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))


            # -----------------------------------
            # DELETE ACCESS KEY ROLLBACK
            # -----------------------------------
            if action == "DELETE_ACCESS_KEY":

                inner = extract_metadata(row)
                user_name = (
                    metadata.get("user_name") or
                    metadata.get("metadata", {}).get("user_name")
                )

                if not user_name:
                    return self._fail(db, execution_id, "Missing user_name for rollback")

                iam = self.aws_session.session.client("iam")

                try:
                    # ⚠️ IMPORTANT:
                    # Deleted key CANNOT be restored → create new one

                    new_key = iam.create_access_key(UserName=user_name)["AccessKey"]

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "action": "DELETE_ACCESS_KEY",
                        "user_name": user_name,
                        "message": "Deleted key cannot be restored. New key created.",
                        "new_key_id": new_key["AccessKeyId"],
                        "new_secret": new_key["SecretAccessKey"],
                        "warning": "Store this secret immediately. It cannot be retrieved again."
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            # -----------------------------------
            # KMS KEY ROTATION ROLLBACK
            # -----------------------------------
            if action == "ENABLE_KMS_KEY_ROTATION":

                inner = extract_metadata(row)

                key_id = inner.get("key_id")
                previous_state = inner.get("previous_rotation_state")

                if not key_id:
                    return self._fail(db, execution_id, "Missing key_id in metadata")

                if previous_state is None:
                    return self._fail(db, execution_id, "Missing previous rotation state")

                kms = self.aws_session.session.client("kms")

                try:
                    # Restore previous state
                    if previous_state is True:
                        kms.enable_key_rotation(KeyId=key_id)
                    else:
                        kms.disable_key_rotation(KeyId=key_id)

                    # Verify
                    current = kms.get_key_rotation_status(KeyId=key_id)

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "key_id": key_id,
                        "restored_rotation_state": current.get("KeyRotationEnabled")
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

    

            # -----------------------------------
            # VPC FLOW LOGS ROLLBACK
            # -----------------------------------

            if action == "ENABLE_VPC_FLOW_LOGS":

                inner = extract_metadata(row)

                flow_log_id = inner.get("flow_log_id")
                region = inner.get("region")

                if not flow_log_id or not region:
                    return self._fail(db, execution_id, "Missing flow_log_id or region for rollback")

                ec2 = self.aws_session.session.client("ec2", region_name=region)

                try:
                    ec2.delete_flow_logs(FlowLogIds=[flow_log_id])

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "flow_log_id": flow_log_id
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            # -----------------------------------
            # DELETE UNUSED SG ROLLBACK
            # -----------------------------------

            if action == "DELETE_UNUSED_SECURITY_GROUP":

                inner = extract_metadata(row)

                sg = inner.get("security_group")

                # 🔥 FIX: region fallback (critical)
                region = (
                    metadata.get("region") or
                    inner.get("region") or
                    getattr(row, "region", None) or
                    getattr(row, "resource_region", None)
                )

                print("ROLLBACK DEBUG → REGION:", region)
                print("ROLLBACK DEBUG → VPC:", sg.get("VpcId") if sg else None)

                if not region:
                    return self._fail(db, execution_id, "Region missing in rollback metadata")

                if not sg:
                    return self._fail(db, execution_id, "Missing security group snapshot")

                ec2 = self.aws_session.session.client("ec2", region_name=region)

                try:
                    # recreate SG
                    response = ec2.create_security_group(
                        GroupName=sg["GroupName"],
                        Description=sg["Description"],
                        VpcId=sg["VpcId"]
                    )

                    new_sg_id = response["GroupId"]

                    # ----------------------------
                    # ✅ INGRESS
                    # ----------------------------
                    if sg.get("IpPermissions"):
                        try:
                            ec2.authorize_security_group_ingress(
                                GroupId=new_sg_id,
                                IpPermissions=sg["IpPermissions"]
                            )
                        except ClientError as e:
                            if "InvalidPermission.Duplicate" not in str(e):
                                raise

                    # ----------------------------
                    # ✅ EGRESS
                    # ----------------------------
                    if sg.get("IpPermissionsEgress"):
                        try:
                            ec2.revoke_security_group_egress(
                                GroupId=new_sg_id,
                                IpPermissions=[{
                                    "IpProtocol": "-1",
                                    "IpRanges": [{"CidrIp": "0.0.0.0/0"}]
                                }]
                            )
                        except ClientError:
                            pass

                        try:
                            ec2.authorize_security_group_egress(
                                GroupId=new_sg_id,
                                IpPermissions=sg["IpPermissionsEgress"]
                            )
                        except ClientError as e:
                            if "InvalidPermission.Duplicate" not in str(e):
                                raise

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "new_security_group_id": new_sg_id
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            # -----------------------------------
            # INLINE WILDCARD POLICY ROLLBACK
            # -----------------------------------
            if action == "REMOVE_INLINE_WILDCARD_POLICY":

                inner = extract_metadata(row)

                user_name = metadata.get("user_name")
                policy_name = metadata.get("policy_name")
                original_policy = metadata.get("original_policy")

                if not user_name or not policy_name or not original_policy:
                    return self._fail(db, execution_id, "Missing rollback metadata")

                iam = self.aws_session.session.client("iam")

                try:
                    iam.put_user_policy(
                        UserName=user_name,
                        PolicyName=policy_name,
                        PolicyDocument=json.dumps(original_policy)
                    )

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "action": action,
                        "user_name": user_name,
                        "policy_name": policy_name
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            if action == "RESTRICT_NACL_INBOUND":

                inner = extract_metadata(row)

                nacl_id = inner.get("nacl_id")
                region = inner.get("region")
                removed_rules = inner.get("removed_rules", [])

                ec2 = self.aws_session.session.client("ec2", region_name=region)

                for rule in removed_rules:

                    params = {
                        "NetworkAclId": nacl_id,
                        "RuleNumber": rule["RuleNumber"],
                        "Protocol": rule["Protocol"],
                        "RuleAction": rule["RuleAction"],
                        "Egress": False,
                        "CidrBlock": rule.get("CidrBlock"),
                    }

                    # ✅ FIX for your error
                    if rule.get("PortRange"):
                        params["PortRange"] = rule["PortRange"]

                    ec2.create_network_acl_entry(**params)

                return self._success(db, execution_id, {"status": "ROLLBACK_SUCCESS"})

            if action == "RESTRICT_NACL_OUTBOUND":

                inner = extract_metadata(row)

                nacl_id = inner.get("nacl_id")
                region = inner.get("region")
                removed_rules = inner.get("removed_rules", [])

                ec2 = self.aws_session.session.client("ec2", region_name=region)

                for rule in removed_rules:

                    params = {
                        "NetworkAclId": nacl_id,
                        "RuleNumber": rule["RuleNumber"],
                        "Protocol": rule["Protocol"],
                        "RuleAction": rule["RuleAction"],
                        "Egress": True,
                        "CidrBlock": rule.get("CidrBlock"),
                    }

                    # ✅ FIX for your error
                    if rule.get("PortRange"):
                        params["PortRange"] = rule["PortRange"]

                    ec2.create_network_acl_entry(**params)

                return self._success(db, execution_id, {"status": "ROLLBACK_SUCCESS"})

            if action == "REMOVE_PUBLIC_ROUTE":

                inner = extract_metadata(row)

                route_table_id = inner.get("route_table_id")
                region = inner.get("region")
                route = inner.get("deleted_route")

                if not route:
                    return self._fail(db, execution_id, "No route data found")

                ec2 = self.aws_session.session.client("ec2", region_name=region)

                ec2.create_route(
                    RouteTableId=route_table_id,
                    DestinationCidrBlock=route.get("DestinationCidrBlock"),
                    GatewayId=route.get("GatewayId")
                )

                return self._success(db, execution_id, {
                    "status": "ROLLBACK_SUCCESS",
                    "route_table_id": route_table_id
                })

            # -----------------------------------
            # IAM ROLE TRUST ROLLBACK
            # -----------------------------------
            if action == "RESTRICT_ROLE_EXTERNAL_TRUST":

                inner = extract_metadata(row)

                role_name = (
                    inner.get("role_name") or
                    metadata.get("role_name") or
                    row.resource_name
                )

                previous_policy = (
                    inner.get("previous_policy") or
                    metadata.get("previous_policy")
                )

                if not role_name or not previous_policy:
                    return self._fail(db, execution_id, "Missing role_name or previous_policy")

                iam = self.aws_session.session.client("iam")

                try:
                    iam.update_assume_role_policy(
                        RoleName=role_name,
                        PolicyDocument=json.dumps(previous_policy)
                    )

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "role_name": role_name
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            if action == "ENABLE_CLOUDTRAIL":

                inner = extract_metadata(row)

                # ✅ FIX 1: Robust extraction
                trail_name = inner.get("trail_name") or metadata.get("trail_name")

                bucket_name = inner.get("bucket_name") or metadata.get("bucket_name")

                region = inner.get("region") or metadata.get("region")

                bucket_created = (
                    inner.get("bucket_created")
                    if "bucket_created" in inner
                    else metadata.get("bucket_created", False)
                )

         

                # ✅ FIX 2: Region fallback
                if not region or region == "global":
                    region = self.aws_session.session.region_name or "us-east-1"

                # ✅ FIX 3: Defensive validation (VERY IMPORTANT)
                if not trail_name:
                    return self._fail(db, execution_id, "Missing trail_name in rollback metadata")

                cloudtrail = self.aws_session.session.client("cloudtrail", region_name=region)
                s3 = self.aws_session.session.client("s3")

                try:
                    # stop logging
                    cloudtrail.stop_logging(Name=trail_name)

                    # delete trail
                    cloudtrail.delete_trail(Name=trail_name)

                    # ✅ delete bucket ONLY if WE created it
                    if bucket_created and bucket_name:

                        paginator = s3.get_paginator("list_objects_v2")

                        for page in paginator.paginate(Bucket=bucket_name):
                            if "Contents" in page:
                                delete_keys = [{"Key": obj["Key"]} for obj in page["Contents"]]

                                s3.delete_objects(
                                    Bucket=bucket_name,
                                    Delete={"Objects": delete_keys}
                                )

                        # now delete bucket
                        s3.delete_bucket(Bucket=bucket_name)

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "trail_name": trail_name
                    })

                except Exception as e:
                    # ✅ FIX 4: Correct error message
                    return self._fail(db, execution_id, f"CloudTrail rollback failed: {str(e)}")

            if action == "START_CLOUDTRAIL_LOGGING":

                inner = extract_metadata(row)

                trail_name = inner.get("trail_name")
                region = inner.get("region")

                if not region or region == "global":
                    region = self.aws_session.session.region_name or "us-east-1"

                if not trail_name:
                    return self._fail(db, execution_id, "Missing trail_name in rollback metadata")

                cloudtrail = self.aws_session.session.client("cloudtrail", region_name=region)

                try:
                    cloudtrail.stop_logging(Name=trail_name)

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "trail_name": trail_name
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            if action == "ENABLE_TERMINATION_PROTECTION":

                inner = extract_metadata(row)

                instance_id = inner.get("instance_id")
                previous_state = inner.get("previous_state")

                if instance_id is None or previous_state is None:
                    return self._fail(db, execution_id, "Missing rollback metadata")

                ec2 = self.aws_session.session.client("ec2")

                try:
                    ec2.modify_instance_attribute(
                        InstanceId=instance_id,
                        DisableApiTermination={"Value": previous_state}
                    )

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "instance_id": instance_id,
                        "restored_state": previous_state
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            # -----------------------------------
            # EBS ENCRYPTION ROLLBACK
            # -----------------------------------
            if action == "ENCRYPT_EBS_VOLUME":

                inner = extract_metadata(row)

                original_volume_id = inner.get("original_volume_id")
                new_volume_id = inner.get("new_volume_id")
                instance_id = inner.get("instance_id")
                device = inner.get("device")
                region = inner.get("region")

                if not original_volume_id or not new_volume_id:
                    return self._fail(db, execution_id, "Missing metadata for rollback")

                ec2 = self.aws_session.session.client("ec2", region_name=region)

                try:
                    # -------------------------
                    # STEP 1 — STOP INSTANCE
                    # -------------------------
                    ec2.stop_instances(InstanceIds=[instance_id])

                    waiter = ec2.get_waiter("instance_stopped")
                    waiter.wait(InstanceIds=[instance_id])

                    # -------------------------
                    # STEP 2 — DETACH NEW (encrypted) volume
                    # -------------------------
                    ec2.detach_volume(
                        VolumeId=new_volume_id,
                        InstanceId=instance_id,
                        Device=device,
                        Force=True
                    )

                    vol_waiter = ec2.get_waiter("volume_available")
                    vol_waiter.wait(VolumeIds=[new_volume_id])

                    # -------------------------
                    # STEP 3 — ATTACH ORIGINAL volume
                    # -------------------------
                    ec2.attach_volume(
                        VolumeId=original_volume_id,
                        InstanceId=instance_id,
                        Device=device
                    )

                    # -------------------------
                    # STEP 4 — START INSTANCE
                    # -------------------------
                    ec2.start_instances(InstanceIds=[instance_id])

                    # -------------------------
                    # STEP 5 — DELETE new volume (optional cleanup)
                    # -------------------------
                    try:
                        ec2.delete_volume(VolumeId=new_volume_id)
                    except:
                        pass

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "restored_volume": original_volume_id
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            # -----------------------------------
            # EC2 IAM ROLE ROLLBACK
            # -----------------------------------
            if action == "ATTACH_IAM_ROLE_TO_INSTANCE":

                inner = extract_metadata(row)

                association_id = inner.get("association_id")
                region = inner.get("region")

                if not association_id:
                    return self._fail(db, execution_id, "Missing association_id")

                ec2 = self.aws_session.session.client("ec2", region_name=region)

                try:
                    ec2.disassociate_iam_instance_profile(
                        AssociationId=association_id
                    )

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            # -----------------------------------
            # REPLACE SECURITY GROUP ROLLBACK
            # -----------------------------------
            if action == "REPLACE_SECURITY_GROUP":

                inner = extract_metadata(row)

                instance_id = inner.get("instance_id")
                region = inner.get("region")
                previous_sgs = inner.get("previous_sgs", [])
                new_sg = inner.get("new_sg")

                if not instance_id or not previous_sgs:
                    return self._fail(db, execution_id, "Missing rollback metadata")

                ec2 = self.aws_session.session.client("ec2", region_name=region)

                try:
                    # restore old SGs
                    ec2.modify_instance_attribute(
                        InstanceId=instance_id,
                        Groups=previous_sgs
                    )

                    # delete newly created SG
                    if new_sg:
                        try:
                            ec2.delete_security_group(GroupId=new_sg)
                        except Exception:
                            pass

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "execution_id": execution_id,
                        "instance_id": instance_id
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            if action == "REMOVE_ELASTIC_IP":

                return self._success(db, execution_id, {
                    "status": "ROLLBACK_NOT_SUPPORTED",
                    "execution_id": execution_id,
                    "note": "Elastic IP was permanently released and cannot be restored"
                })

            # -----------------------------------
            # DELETE UNUSED IAM USER ROLLBACK
            # -----------------------------------
            if action == "DELETE_UNUSED_IAM_USER":

                inner = extract_metadata(row)

                backup = inner.get("user_backup")

                if not backup:
                    return self._fail(db, execution_id, "No backup found")

                iam = self.aws_session.session.client("iam")

                try:
                    user_name = backup["user"]["UserName"]

                    # recreate user
                    iam.create_user(UserName=user_name)

                    # restore login profile (password reset required)
                    if backup.get("login_profile"):
                        iam.create_login_profile(
                            UserName=user_name,
                            Password="TempPassword@123",  # 🔥 forced reset
                            PasswordResetRequired=True
                        )

                    # restore inline policies
                    for p in backup.get("inline_policies", []):
                        iam.put_user_policy(
                            UserName=user_name,
                            PolicyName=p["policy_name"],
                            PolicyDocument=json.dumps(p["document"])
                        )

                    # restore attached policies
                    for p in backup.get("attached_policies", []):
                        iam.attach_user_policy(
                            UserName=user_name,
                            PolicyArn=p["PolicyArn"]
                        )

                    # restore groups
                    for g in backup.get("groups", []):
                        iam.add_user_to_group(
                            UserName=user_name,
                            GroupName=g["GroupName"]
                        )

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "action": action,
                        "user_name": user_name
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))

            if action == "STOP_EC2_INSTANCE":

                inner = extract_metadata(row)

                instance_id = inner.get("instance_id")
                region = inner.get("region")

                ec2 = self.aws_session.session.client("ec2", region_name=region)

                try:
                    ec2.start_instances(InstanceIds=[instance_id])

                    return self._success(db, execution_id, {
                        "status": "ROLLBACK_SUCCESS",
                        "instance_id": instance_id
                    })

                except Exception as e:
                    return self._fail(db, execution_id, str(e))


            if action == "TERMINATE_EC2_INSTANCE":

                return self._success(db, execution_id, {
                    "status": "ROLLBACK_NOT_SUPPORTED",
                    "note": "Terminated instance cannot be restored"
                })

            
            # =====================================================
            # UNKNOWN
            # =====================================================
            return self._fail(db, execution_id, f"Rollback not supported for action: {action}")

        finally:
            db.close()
