import sys

file_path = r'd:\ACC-E45-ACE\HackNex\frontend\src\components\VideoPlayer.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

v_start = -1
c_end = -1
for i, line in enumerate(lines):
    if '{/* Video Container */}' in line:
        if v_start == -1:
            v_start = i
    if v_start != -1 and i > v_start and '              </div>' in line and '            </div>' in lines[i+1] and 'bg-slate-700' in lines[i+3]:
        c_end = i - 1
        break

if v_start != -1 and c_end != -1:
    print('Section C starts at', v_start, 'and ends at', c_end)
    section_c = lines[v_start:c_end + 1]
    
    # Section D ends at the closing brace of the toolbar, which is followed by {/* Dynamic Studio Helper Banner */}
    d_start = c_end + 1
    d_end = -1
    for i in range(d_start, len(lines)):
        if '{/* Dynamic Studio Helper Banner */}' in lines[i]:
            d_end = i - 1
            break
            
    print('Section D starts at', d_start, 'and ends at', d_end)
    
    if d_end != -1:
        section_d = lines[d_start:d_end + 1]
        
        # We need to swap Section C and Section D
        new_lines = lines[:v_start] + section_d + section_c + lines[d_end + 1:]
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print('Fixed the file order!')
else:
    print('Could not find Section C boundaries')
