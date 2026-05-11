// Preconfigured storage helpers for Manus WebDev templates
// Uses the Biz-provided storage proxy (Authorization: Bearer <token>)

import { ENV } from "./_core/env";

type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(baseUrl: string, relKey: string, apiKey: string): Promise<string> {
  const downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string,
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`,
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}

// ─── 阿里云 OSS 头像上传 ──────────────────────────────────────────────────────
import OSS from "ali-oss";

function getOssClient(): OSS {
  if (!ENV.ossAccessKeyId || !ENV.ossAccessKeySecret || !ENV.ossBucket) {
    throw new Error("OSS credentials missing: set OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET");
  }
  return new OSS({
    region: ENV.ossRegion,
    accessKeyId: ENV.ossAccessKeyId,
    accessKeySecret: ENV.ossAccessKeySecret,
    bucket: ENV.ossBucket,
  });
}

/**
 * 上传图片到阿里云 OSS，返回永久公共 URL（公共读 Bucket）
 * key 示例：avatars/member/123-1715000000000.jpg
 */
export async function ossUploadAvatar(
  key: string,
  data: Buffer,
  contentType = "image/jpeg",
): Promise<{ key: string; url: string }> {
  const client = getOssClient();
  await client.put(key, data, { mime: contentType });
  // 公共读 Bucket：直接返回永久 URL，无需签名
  const region = ENV.ossRegion ?? "oss-cn-beijing";
  const bucket = ENV.ossBucket;
  const url = `https://${bucket}.${region}.aliyuncs.com/${key}`;
  return { key, url };
}

/**
 * 根据 OSS key 生成永久公共 URL（公共读 Bucket）
 */
export async function ossGetPublicUrl(key: string): Promise<string> {
  const region = ENV.ossRegion ?? "oss-cn-beijing";
  const bucket = ENV.ossBucket;
  return `https://${bucket}.${region}.aliyuncs.com/${key}`;
}
