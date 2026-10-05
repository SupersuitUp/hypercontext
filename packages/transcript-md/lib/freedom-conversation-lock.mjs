// Mutation-only module. The read door never imports subprocesses or locks.
import {execFileSync} from 'node:child_process';
import {realpathSync,lstatSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {paths,stateDir} from './freedom-workspace.mjs';
import {acquire,release} from './freedom-run-lock.mjs';
import {withRunLock,MIGRATE_LOCK} from './freedom-migrate-common.mjs';

const refuse=code=>{throw Object.assign(new Error(`${code}: Conversation mutation lock refused.`),{code});};
/** Git's common-dir output is resolved against the actual command cwd, including subfolders. */
export function conversationLockContext(root) {
 if(typeof root!=='string'||!root)refuse('WORKSPACE_REQUIRED');
 const workspace=realpathSync(resolve(root));
 let gitCommonDir=null;
 try {
  const output=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:workspace,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  gitCommonDir=realpathSync(resolve(workspace,output));
 } catch(e) {
  if(e.status!==128||!String(e.stderr).includes('not a git repository'))refuse('LOCK_IDENTITY_UNAVAILABLE');
 }
 const transcripts=resolve(paths(workspace).transcripts);
 return {root:workspace,transcripts,gitCommonDir,scope:gitCommonDir?'common-git':'transcript-root-only',
  lockPath:gitCommonDir?join(gitCommonDir,'freedom-conversation-mutation.lock'):join(transcripts,'.conversation-mutation.lock'),
  journalDir:gitCommonDir?join(gitCommonDir,'freedom-conversation-revisions'):stateDir('conversation-revisions',workspace)};
}
const noLink=file=>{try{if(lstatSync(file).isSymbolicLink())refuse('SYMLINK_REFUSED');}catch(e){if(e.code!=='ENOENT')throw e;}};
/** Hold common-repository lock first, then the existing capture lock, throughout fn. */
export function withConversationLock(root,{pid,by},fn) {
 const context=conversationLockContext(root);
 noLink(context.transcripts);noLink(context.lockPath);
 if(!context.gitCommonDir)mkdirSync(context.transcripts,{recursive:true});
 const lock=acquire(context.lockPath,{pid,by});
 if(!lock.acquired)refuse('LOCKED');
 try {
  noLink(stateDir(MIGRATE_LOCK,context.root));noLink(join(stateDir(MIGRATE_LOCK,context.root),'.lock'));
  let entered=false;
  const result=withRunLock(context.root,{pid,by},()=>{entered=true;return fn();});
  if(!entered)refuse('LOCKED'); // Capture refusal is a result object, never fn success.
  return result;
 } finally {if(!lock.reentrant)release(context.lockPath,{pid});}
}
