import * as core from "@actions/core";
import { UALogin, getRawSecrets, oidcLogin } from "./infisical.js";
import fs from "fs/promises";

const formatEnvValue = (val) => {
  if (typeof val !== "string") return val;
  if (val.includes("\n")) {
    return val.replace(/\n/g, '\\n').replace(/\r/g, '');
  }
  return val;
};

try {
  const method = core.getInput("method");
  const UAClientId = core.getInput("client-id");
  const UAClientSecret = core.getInput("client-secret");
  const identityId = core.getInput("identity-id");
  const oidcAudience = core.getInput("oidc-audience");
  const domain = core.getInput("domain");
  const envSlug = core.getInput("env-slug");
  const projectSlug = core.getInput("project-slug");
  const secretPath = core.getInput("secret-path");
  const exportType = core.getInput("export-type");
  const fileOutputDir = core.getInput("file-output-dir");
  const exportSubdirectories = core.getBooleanInput("export-subdirectories");
  const shouldIncludeImports = core.getBooleanInput("include-imports");
  const shouldRecurse = core.getBooleanInput("recursive");

  // get infisical token using UA credentials
  let infisicalToken;

  switch (method) {
    case "universal": {
      if (!(UAClientId && UAClientSecret)) {
        throw new Error("Missing universal auth credentials");
      }
      infisicalToken = await UALogin({
        domain,
        clientId: UAClientId,
        clientSecret: UAClientSecret,
      });
      break;
    }
    case "oidc": {
      if (!identityId) {
        throw new Error("Missing identity ID");
      }
      infisicalToken = await oidcLogin({
        domain,
        identityId,
        oidcAudience,
      });
      break;
    }
    default:
      throw new Error("Invalid authentication method");
  }

  // Fetch from Infisical (returns { flat, grouped })
  const secretsData = await getRawSecrets({
    domain,
    envSlug,
    infisicalToken,
    projectSlug,
    secretPath,
    shouldIncludeImports,
    shouldRecurse,
  });

  const keyValueSecrets = secretsData.flat;
  const groupedSecrets = secretsData.grouped;

  core.debug(
    `Exporting the following envs", ${JSON.stringify(
      Object.keys(keyValueSecrets)
    )}`
  );

  if (exportType === "env") {
    Object.entries(keyValueSecrets).forEach(([key, value]) => {
      core.setSecret(value);
      core.exportVariable(key, value);
    });
    core.info("Injected secrets as environment variables");
  } else if (exportType === "file") {
    const cleanOutputDir = fileOutputDir.replace(/\/$/, "") || "/";
    const basePath = `${process.env.GITHUB_WORKSPACE}${cleanOutputDir}`;

    try {
      await fs.mkdir(basePath, { recursive: true });

      if (exportSubdirectories) {
        for (const [currentPath, secrets] of Object.entries(groupedSecrets)) {
          if (Object.keys(secrets).length === 0) continue;

          let fileName = "";
          const cleanSecretPath = secretPath.replace(/\/$/, "") || "/";
          const cleanCurrentPath = currentPath.replace(/\/$/, "") || "/";

          if (cleanCurrentPath === cleanSecretPath) {
            fileName = ".env";
          } else {
            let subfolder = cleanCurrentPath;
            if (cleanSecretPath !== "/") {
              subfolder = subfolder.replace(cleanSecretPath, "");
            }
            subfolder = subfolder.replace(/^\//, "").replace(/\//g, "-");
            fileName = `${subfolder}.env`;
          }

          const targetPath = `${basePath}/${fileName}`;
          const fileContent = Object.entries(secrets)
            .map(([k, v]) => `${k}=${formatEnvValue(v)}`)
            .join("\n");
          
          core.info(`Exporting secrets from Infisical path '${currentPath}' to ${targetPath}`);
          await fs.writeFile(targetPath, fileContent);
        }
        core.info("Successfully exported folder-based secrets!");

      } else {
        const fileContent = Object.entries(keyValueSecrets)
          .map(([key, value]) => `${key}=${formatEnvValue(value)}`)
          .join("\n");
          
        const targetPath = `${basePath}/.env`;
        
        core.info(`Exporting secrets to ${targetPath}`);
        await fs.writeFile(targetPath, fileContent);
        core.info("Successfully exported secrets to file");
      }
    } catch (err) {
      core.error(`Error writing file(s): ${err.message}`);
      throw err;
    }
  }
} catch (error) {
  core.setFailed(error.message);
}