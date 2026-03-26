import sys

files = [
    'g:/vue/SS-Helper/MemoryOS/src/ui/workbenchTabs/actorTabs/actorRelationships.ts',
    'g:/vue/SS-Helper/MemoryOS/src/ui/workbenchTabs/actorTabs/relationshipGraph.ts'
]

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    c = c.replace('\\`', '`').replace('\\$', '$')
    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)
print("done")
