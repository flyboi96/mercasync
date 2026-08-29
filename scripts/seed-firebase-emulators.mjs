const projectId = 'demo-mercasync';
const householdId = 'mercasync-home';
const authBase = 'http://127.0.0.1:9099';
const firestoreBase =
  `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`;
const password = 'mercasync-local';

const members = [
  {
    personId: 'alex',
    displayName: 'Alex',
    email: 'alex@mercasync.local',
    color: '#0f4c3a',
  },
  {
    personId: 'nathalia',
    displayName: 'Nathalia',
    email: 'nathalia@mercasync.local',
    color: '#e5654f',
  },
];

async function authRequest(path, body) {
  const response = await fetch(`${authBase}${path}?key=demo-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Auth emulator returned ${response.status}`);
  }
  return data;
}

async function ensureUser(member) {
  try {
    return await authRequest('/identitytoolkit.googleapis.com/v1/accounts:signUp', {
      email: member.email,
      password,
      returnSecureToken: true,
      displayName: member.displayName,
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('EMAIL_EXISTS')) {
      throw error;
    }
    return authRequest('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', {
      email: member.email,
      password,
      returnSecureToken: true,
    });
  }
}

function stringValue(value) {
  return { stringValue: value };
}

async function writeDocument(path, fields) {
  const response = await fetch(`${firestoreBase}/${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer owner',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    throw new Error(`Firestore emulator returned ${response.status}: ${await response.text()}`);
  }
}

try {
  const seededMembers = [];
  for (const member of members) {
    const user = await ensureUser(member);
    seededMembers.push({ ...member, uid: user.localId });
  }

  await writeDocument(`households/${householdId}`, {
    name: stringValue('Alex & Nathalia'),
    timezone: stringValue('America/Denver'),
    memberIds: {
      arrayValue: {
        values: seededMembers.map((member) => stringValue(member.uid)),
      },
    },
  });

  for (const member of seededMembers) {
    await writeDocument(`households/${householdId}/members/${member.uid}`, {
      personId: stringValue(member.personId),
      displayName: stringValue(member.displayName),
      color: stringValue(member.color),
    });
  }

  console.log('Seeded the local MercaSync household.');
  console.log('Alex: alex@mercasync.local / mercasync-local');
  console.log('Nathalia: nathalia@mercasync.local / mercasync-local');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error('Start the Auth and Firestore emulators before running this script.');
  process.exitCode = 1;
}
