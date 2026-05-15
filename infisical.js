import axios from "axios";
import * as core from "@actions/core";
import querystring from "querystring";

export const UALogin = async ({ clientId, clientSecret, domain }) => {
  const loginData = querystring.stringify({
    clientId,
    clientSecret,
  });

  try {
    const response = await axios({
      method: "post",
      url: `${domain}/api/v1/auth/universal-auth/login`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: loginData,
    });
    return response.data.accessToken;
  } catch (err) {
    core.error(err.response?.data?.message || err.message);
    throw err;
  }
};

export const oidcLogin = async ({ identityId, domain, oidcAudience }) => {
  const idToken = await core.getIDToken(oidcAudience);

  const loginData = querystring.stringify({
    identityId,
    jwt: idToken,
  });

  try {
    const response = await axios({
      method: "post",
      url: `${domain}/api/v1/auth/oidc-auth/login`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: loginData,
    });

    return response.data.accessToken;
  } catch (err) {
    core.error(err.response?.data?.message || err.message);
    throw err;
  }
};

export const getRawSecrets = async ({
  domain,
  envSlug,
  infisicalToken,
  projectSlug,
  secretPath,
  shouldIncludeImports,
  shouldRecurse,
}) => {
  try {
    const response = await axios({
      method: "get",
      url: `${domain}/api/v3/secrets/raw`,
      headers: {
        Authorization: `Bearer ${infisicalToken}`,
      },
      params: {
        secretPath,
        environment: envSlug,
        include_imports: shouldIncludeImports,
        recursive: shouldRecurse,
        workspaceSlug: projectSlug,
        expandSecretReferences: true,
      },
    });

    const flatSecrets = {};
    const groupedSecrets = {};

    response.data.secrets.forEach((secret) => {
      flatSecrets[secret.secretKey] = secret.secretValue;
      
      const path = secret.secretPath || secretPath;
      if (!groupedSecrets[path]) groupedSecrets[path] = {};
      groupedSecrets[path][secret.secretKey] = secret.secretValue;
    });

    // process imported secrets
    if (response.data.imports) {
      const imports = response.data.imports;
      for (let i = imports.length - 1; i >= 0; i--) {
        const importedSecrets = imports[i].secrets;
        importedSecrets.forEach((secret) => {
          if (flatSecrets[secret.secretKey] === undefined) {
            flatSecrets[secret.secretKey] = secret.secretValue;
          }
          if (!groupedSecrets[secretPath]) groupedSecrets[secretPath] = {};
          if (groupedSecrets[secretPath][secret.secretKey] === undefined) {
            groupedSecrets[secretPath][secret.secretKey] = secret.secretValue;
          }
        });
      }
    }

    return { flat: flatSecrets, grouped: groupedSecrets };
  } catch (err) {
    core.error(err.response?.data?.message || err.message);
    throw err;
  }
};