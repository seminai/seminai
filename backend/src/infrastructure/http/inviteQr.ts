import QRCode from 'qrcode';

export async function inviteQrDataUrl(inviteUrl: string): Promise<string> {
  return QRCode.toDataURL(inviteUrl, { margin: 1, width: 256 });
}
