const fs = require('fs');
['MemoryOS/src/ui/workbenchTabs/actorTabs/actorRelationships.ts','MemoryOS/src/ui/workbenchTabs/actorTabs/relationshipGraph.ts'].forEach(f=>{
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(/\\`/g, '`');
    c = c.replace(/\\\$/g, '$');
    fs.writeFileSync(f, c);
});
console.log('Fixed files');
