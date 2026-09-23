// The signed-in user and server capabilities, from /api/session at boot.
let info = { user: null, mode: 'open', store: 'file', llm: null };
export const setSessionInfo = (s) => { info = { ...info, ...s }; };
export const getSessionInfo = () => info;
export const currentUser = () => info.user;
export const isOwner = () => info.user?.role === 'owner';
