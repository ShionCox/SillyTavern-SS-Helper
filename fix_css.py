import pathlib

file_path = pathlib.Path(r'g:\vue\SS-Helper\MemoryOS\src\ui\workbenchTabs\tabEntries.ts')
content = file_path.read_text(encoding='utf-8')

# Fix outer editor wrapper
content = content.replace(
    '<div class="stx-memory-workbench__editor" style="padding:0; overflow:hidden;">\n                    <div style="display:flex; flex-direction:row; height:100%; width:100%;">',
    '<div class="stx-memory-workbench__editor" style="padding:0; overflow:hidden; display:flex; flex-direction:row;">'
)

# And similarly for CRLF
content = content.replace(
    '<div class="stx-memory-workbench__editor" style="padding:0; overflow:hidden;">\r\n                    <div style="display:flex; flex-direction:row; height:100%; width:100%;">',
    '<div class="stx-memory-workbench__editor" style="padding:0; overflow:hidden; display:flex; flex-direction:row;">'
)

# Fix Left Column
content = content.replace(
    '<div style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px; min-height:0; height:0;">',
    '<div style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">'
)

# Fix Right Column scroll area
content = content.replace(
    '<div style="padding:16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:16px; min-height:0; height:0;">',
    '<div style="padding:16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:16px; min-height:0;">'
)

# Fix trailing nested div closure for the removed row wrapper
# Wait! Since I removed the inner `<div style="display:flex; flex-direction:row; height:100%; width:100%;">`, I must remove ONE closing `</div>`!
# Let's find the closing tags:
#                     </div>
#                 </div>
#             </div>
#         </section>
# Before my change, it was 4 closing divs. Now it should be 3 closing divs.
# I'll just find the exact block and replace it.
end_block = """                    </div>
                </div>
            </div>
        </section>"""
new_end_block = """                </div>
            </div>
        </section>"""
content = content.replace(end_block, new_end_block)

file_path.write_text(content, encoding='utf-8')
print("Applied CSS fixes.")
