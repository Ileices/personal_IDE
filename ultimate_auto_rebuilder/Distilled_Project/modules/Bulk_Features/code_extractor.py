#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=======================================================================
Code-Extractor RBY  📋→📂   —  Cyberpunk Edition
=======================================================================
Paste ANY lump of text containing Markdown code-blocks and extract each
```python ... ``` segment into standalone *.py* files inside a user-
chosen directory.

• Dark neon theme, split view (File Explorer | Notebook: Paste Pad + Log)
• Auto-detects "# filename: xyz.py" header or enumerates script_1.py …
• Collision-safe, illegal-char stripping, full logging to ./logs
-----------------------------------------------------------------------
"""

import os, re, logging, datetime, tkinter as tk
from tkinter import ttk, filedialog, messagebox

# ──────────────────────────────────────────────────────────────────────
#  CONFIG & LOGGING
# ──────────────────────────────────────────────────────────────────────
APP_NAME       = "Code-Extractor RBY"
PRIMARY_BG     = "#0A0A0A"
NEON_GREEN_FG  = "#39FF14"
NEON_RED       = "#FF073A"
FONT_FAMILY    = "Consolas"

LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    filename=os.path.join(LOG_DIR, "code_extractor.log"),
    level=logging.DEBUG,
    format="%(asctime)s  %(levelname)-8s  %(message)s"
)

ILLEGAL = re.compile(r'[<>:"/\\|?*\x00-\x1F]')

def safe_name(name:str)->str:
    return ILLEGAL.sub("_", name)

def unique(path:str)->str:
    base,ext=os.path.splitext(path); n=1
    while os.path.exists(path):
        path=f"{base}_{n}{ext}"; n+=1
    return path

# Updated regex pattern to handle various code block formats
BLOCK_RE = re.compile(r"```(?:python)?\n?(.*?)```", re.DOTALL)

# ──────────────────────────────────────────────────────────────────────
#  GUI THEME
# ──────────────────────────────────────────────────────────────────────
def apply_theme():
    st=ttk.Style(); st.theme_use("clam")
    st.configure(".", background=PRIMARY_BG, foreground=NEON_GREEN_FG,
                 fieldbackground=PRIMARY_BG, font=(FONT_FAMILY,10))
    st.configure("Treeview", background=PRIMARY_BG, foreground=NEON_GREEN_FG,
                 rowheight=22, borderwidth=0)
    st.map("Treeview", background=[("selected", NEON_RED)],
           foreground=[("selected","#fff")])
    st.configure("TNotebook.Tab", background=PRIMARY_BG,
                 foreground=NEON_GREEN_FG, padding=6)
    st.map("TNotebook.Tab", background=[("selected", NEON_RED)],
           foreground=[("selected","#fff")])
    st.configure("TButton", background=PRIMARY_BG, foreground=NEON_GREEN_FG)
    st.map("TButton", background=[("active", NEON_RED)],
           foreground=[("active","#fff")])

# ──────────────────────────────────────────────────────────────────────
#  APP
# ──────────────────────────────────────────────────────────────────────
class CodeExtractor(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_NAME); self.geometry("1100x650"); self.configure(bg=PRIMARY_BG)
        apply_theme()
        self.dir_var=tk.StringVar()
        self._build_menu(); self._build_toolbar(); self._build_panes(); self._build_status()

    # Menu
    def _build_menu(self):
        mb=tk.Menu(self,bg=PRIMARY_BG,fg=NEON_GREEN_FG,
                   activebackground=NEON_RED,activeforeground="#fff")
        fm=tk.Menu(mb,tearoff=0,bg=PRIMARY_BG,fg=NEON_GREEN_FG)
        fm.add_command(label="Choose Output Folder…",command=self.pick_dir)
        fm.add_separator(); fm.add_command(label="Exit",command=self.quit)
        mb.add_cascade(label="File",menu=fm)
        for lab in ("Edit","View","Tools","Settings","Help"):
            dummy=tk.Menu(mb,tearoff=0,bg=PRIMARY_BG,fg=NEON_GREEN_FG)
            dummy.add_command(label="[Placeholder]")
            mb.add_cascade(label=lab,menu=dummy)
        self.config(menu=mb)

    # Toolbar
    def _build_toolbar(self):
        tb=ttk.Frame(self); tb.pack(fill="x")
        ttk.Button(tb,text="Choose Folder",command=self.pick_dir).pack(side="left",padx=4)
        ttk.Button(tb,text="Extract",command=self.extract).pack(side="left",padx=4)
        ttk.Button(tb,text="Save Scripts",command=self.save_files).pack(side="left",padx=4)

    # Panes
    def _build_panes(self):
        self.paned=ttk.PanedWindow(self,orient="horizontal"); self.paned.pack(fill="both",expand=True)
        # Explorer
        l=ttk.Frame(self.paned,width=300)
        self.tree=ttk.Treeview(l); self.tree.pack(fill="both",expand=True,side="left")
        scr=ttk.Scrollbar(l,command=self.tree.yview); scr.pack(side="right",fill="y")
        self.tree.configure(yscrollcommand=scr.set)
        self.paned.add(l)

        # Notebook
        self.nb=ttk.Notebook(self.paned)
        self.pad=tk.Text(self.nb,bg="#141414",fg=NEON_GREEN_FG,insertbackground=NEON_RED)
        self.log=tk.Text(self.nb,bg="#141414",fg=NEON_GREEN_FG,insertbackground=NEON_RED,state="disabled")
        self.nb.add(self.pad,text="Paste Pad"); self.nb.add(self.log,text="Log")
        self.paned.add(self.nb)

    # Status
    def _build_status(self):
        st=ttk.Frame(self); st.pack(fill="x")
        ttk.Label(st,textvariable=self.dir_var).pack(side="left",padx=6)

    # Directory chooser
    def pick_dir(self):
        p=filedialog.askdirectory(title="Select output folder")
        if p: self.dir_var.set(p); self.populate_tree(p)

    def populate_tree(self,root):
        self.tree.delete(*self.tree.get_children())
        def walk(parent,abspath):
            for itm in sorted(os.listdir(abspath)):
                fp=os.path.join(abspath,itm); node=self.tree.insert(parent,"end",text=itm,values=[fp])
                if os.path.isdir(fp): walk(node,fp)
        walk("",root)

    # Logging
    def _log(self,msg):
        self.log.configure(state="normal"); self.log.insert("end",msg+"\n")
        self.log.configure(state="disabled"); self.log.see("end")

    # Extraction
    def extract(self):
        self.scripts=[]
        txt=self.pad.get("1.0","end")
        # Normalize line endings and remove potential leading/trailing whitespace
        txt = txt.replace('\r\n', '\n').replace('\r', '\n').strip()
        
        # First try with more flexible pattern
        blocks = re.findall(r"```(?:python)?\n?(.*?)```", txt, re.DOTALL)
        
        # If no blocks found, try alternative patterns
        if not blocks:
            blocks = re.findall(r"```(?:python)?\s*\n(.*?)```", txt, re.DOTALL)
        if not blocks:
            blocks = re.findall(r"```(?:python)?(.*?)```", txt, re.DOTALL)
        
        if not blocks:
            messagebox.showinfo("None found","No ```python``` blocks detected.")
            return
            
        for idx,code in enumerate(blocks,1):
            code=code.strip("\n")
            # Look for filename declaration in first 3 lines
            fname = None
            for line in code.splitlines()[:3]:
                m=re.match(r"#\s*filename\s*:\s*(\S+)", line, re.I)
                if m: 
                    fname=safe_name(m.group(1))
                    break
            if not fname or not fname.endswith(".py"): 
                fname=f"script_{idx}.py"
            self.scripts.append((fname, code))
        self._log(f"Found {len(self.scripts)} script(s). Ready to save.")

    # Save
    def save_files(self):
        root=self.dir_var.get()
        if not os.path.isdir(root):
            messagebox.showwarning("Folder?","Choose an output folder first."); return
        if not hasattr(self,"scripts") or not self.scripts:
            messagebox.showwarning("Extract first","Run Extract before saving."); return
        saved,failed=0,0
        for fname,code in self.scripts:
            path=unique(os.path.join(root,fname))
            try:
                with open(path,"w",encoding="utf-8") as f: 
                    f.write(code+"\n")
                saved+=1; self._log(f"✔ {path}")
                logging.info("SAVED %s", path)
            except Exception as e:
                failed+=1; self._log(f"✖ {path}  ({e})")
                logging.error("FAILED %s :: %s", path, e)
        messagebox.showinfo("Done",f"Saved {saved} scripts. {failed} failures." )
        self.populate_tree(root)

# ──────────────────────────────────────────────────────────────────────
if __name__=="__main__":
    CodeExtractor().mainloop()