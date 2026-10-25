const vscode=require('vscode');const assert=require('assert');const fs=require('fs');
exports.run=async function(){
 const extension=vscode.extensions.all.find(e=>e.id.toLowerCase()==='a-znk.taskvision');assert.ok(extension,'installed preview found');await extension.activate();assert.ok(extension.isActive,'extension activated');
 const all=await vscode.commands.getCommands(true);const required=['openWorkspace','stopWorkspace','copyMcpConfig','enableKnowledgeTags','exportAiContext','syncDataModel','setTaskStatus','refresh'];for(const name of required)assert.ok(all.includes('taskvision.'+name),'registered '+name);
 const config=vscode.workspace.getConfiguration('taskvision.general');await config.update('tags',['TODO','CUSTOM'],vscode.ConfigurationTarget.Workspace);await vscode.commands.executeCommand('taskvision.enableKnowledgeTags');const tags=vscode.workspace.getConfiguration('taskvision.general').get('tags');for(const tag of ['TODO','CUSTOM','CORE','REUSE','INTENT','REVIEW'])assert.ok(tags.includes(tag),'preserved/enabled '+tag);
 const output={passed:true,extensionVersion:extension.packageJSON.version,active:extension.isActive,registeredCommands:required,enabledTags:tags,workspaceTrusted:vscode.workspace.isTrusted};fs.writeFileSync(process.env.TASKVISION_EHOST_RESULTS,JSON.stringify(output,null,2));console.log('TASKVISION_EXTENSION_HOST_PASS '+JSON.stringify(output));
};
