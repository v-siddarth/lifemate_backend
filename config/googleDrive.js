const { google } = require('googleapis');
const { Readable } = require('stream');

const RESUME_FOLDER_ID = '1EV8esxVjf4AxIQWbyjwRXu5e2D2NK4iZ';

const ServiceAccount = {
  type: 'service_account',
  project_id: 'doctor-dd7e8',
  private_key_id: '368a04ac49ec5efde71ccbdd682fbedf9bccd513',
  private_key:
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC5gOfzkapJPjva\nAXrXdmnhZc3Lsws8nGqMv1HUUSwsR+bKkUtK+UI5N7bBrhD/ydad1GILXvS2QF2D\nxDImTS0Nk4Y7OokUHR1v4/iXtPVTC/VMU+Zcrudl+RL8uei/UOzcfLEDI8s0Qgly\naZtjqGI9fYQU2Ig1XXkcSYHCKvY6352E8NBxI+yA7VRzyZnv/MEuozCPvayKGtnH\n3ol7I76PKJHRkgKV6omZhKWlUXBdNMU0cdIthJcXdEr0RrcyRUyITaibcYXsbJMT\nEo+1iA5PxlUelQpJcVd4Pj91y3VfslP3zcNFeEFS6d3ua2mnQ3uTbGxr0BqTlUEG\nPx9UBQoXAgMBAAECggEANy5QUVUIaac4mJ4OE5/m2SS2dhy5f/sretjCl7zZvgZZ\ncfKMii3hdDHNjImiBuTckbCGxckmVDyLVNH89QXKHBrBOEcuVaxfgFQ5M6+htmV9\nP4pJoVJqBRx1eHY49Qg2nVP+N+fi35WxR7aAgcGqD46Rxr2urukySKbZEZBEFLjE\nUCy/j+qhAPhPXQgj4TCahLM55u9Yj21l7BijVgGPEagOKWSEV1pBBEvtWEu/6oSA\n3VHBWA1ggJok2lbdUs8RmXWaebKikoioLfhj6Cbbc378vjmeda1mfYsir8dXa+7Z\nBnPjjJzh3s7gBEIETcoBvLIVT/JrDTTnTy1NGlmq2QKBgQDkgfgpWuKupzy3T9PO\nIhF1/C/kbjiFbiFBd0Z1cVlc5aeeBG7LgGYRfjPhoax4Y7/2zIalDld6b2t0Zcoo\noKLzcZtogrdUoKDu0aXbRiDyoCOYXGw8kpxRORgcWbmCCPfKqfFRSz5gS+5Ur96O\nTVRvZeqiipaGalU4pJvfimYHJQKBgQDP0mjxt9K9j2aFaEA2wbaqjfe4rKVYSjzx\nNYXEZmH1T4ml2K824CtQZxk5TXFOZybkQlquTLGkQNaQgaXIBhfKmqp6MyjjXwED\nGL+omLRkhbNpSpd3rBejf3xG+R0OphsAXTnnEKmLJp6vYG3inZjAyxaVE8xS98IA\nlIcUCaq1iwKBgAcwh6xVbbhtDp395v4fWElMC/218hVQp781j4P2cwdXOnTgUtQY\nUB3QyLUaryCCkvGi8cGTt/DkPI9G/JtWooniUy9wnXAONcIN2pgRlsvLehM7JTSq\nsDxl/Xo24H1U5ub7fdo+8dF50h/cALadfECdBkri7WWBRvknRLg91IP5AoGBAMvc\ne1WiHPgWU1tKiLMuEyH7YaWmtguFx4JWHoIqbK1W+I/XnwkVnWehuvybGyrtxRjk\nfk+8rAWUFOZsR1OPpob4cYKt7M4dw8Bl5pxcL5jsDrKamTqrdgTMafy1IevcxV/2\nE3a2wZneqIsg7KoALnfwwJY8dZJtt8EZ8eeWE/9BAoGAYz6ywuupL45ow8HifRhy\nm583Z0+fWejLqxwo0W4f8SkNklfhRYaNpxtNi4x504wMxm6Uv7fetYANg9e5D64T\nOEjOAvzdUxv+Hv15S7ZIgctV9Bq9BMcF6X1h1j1aajJLZfpVoFefxVSuWVLalNn9\nOX+WIQ9M0p7Dg1Nkicp/SrU=\n-----END PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk-lcnp1@doctor-dd7e8.iam.gserviceaccount.com',
  client_id: '113298677154530909102',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url:
    'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-lcnp1%40doctor-dd7e8.iam.gserviceaccount.com',
  universe_domain: 'googleapis.com',
};

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: ServiceAccount,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Upload a file buffer to Google Drive
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} fileName - Name for the file in Drive
 * @param {string} [folderId] - Drive folder ID (defaults to RESUME_FOLDER_ID)
 * @returns {Promise<{fileId: string, webViewLink: string}>}
 */
async function uploadToDrive(fileBuffer, fileName, folderId) {
  const drive = getDriveClient();

  const bufferStream = new Readable();
  bufferStream.push(fileBuffer);
  bufferStream.push(null);

  const driveFile = await drive.files.create({
    resource: {
      name: fileName,
      parents: [folderId || RESUME_FOLDER_ID],
    },
    media: {
      mimeType: 'application/pdf',
      body: bufferStream,
    },
    fields: 'id, webViewLink, size',
  });

  return {
    fileId: driveFile.data.id,
    webViewLink: driveFile.data.webViewLink,
    size: driveFile.data.size ? Number(driveFile.data.size) : 0,
  };
}

/**
 * Delete a file from Google Drive by its file ID
 * @param {string} fileId - The Google Drive file ID
 */
async function deleteFromDrive(fileId) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}

module.exports = {
  uploadToDrive,
  deleteFromDrive,
  RESUME_FOLDER_ID,
};