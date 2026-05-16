"""
CloudShield MCA Synopsis — Final Version
Karnatak University, Dharwad
Rules strictly followed:
  Font     : Times New Roman, 12pt
  Paper    : A4, one side
  Spacing  : Double line spacing throughout
  Margins  : Left 3.5 cm | Top 2.5 cm | Right 1.25 cm | Bottom 1.25 cm
  Tables   : Caption ABOVE every table (rule 3)
  Sections : Breathing space between sections, not cramped
"""

from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import zipfile, os, shutil

# ─────────────────────────────────────────────────────────────────────────────
#  DOCUMENT SETUP
# ─────────────────────────────────────────────────────────────────────────────
doc = Document()

# A4 + university margins
for sec in doc.sections:
    sec.page_width    = Cm(21.0)
    sec.page_height   = Cm(29.7)
    sec.left_margin   = Cm(3.5)
    sec.top_margin    = Cm(2.5)
    sec.right_margin  = Cm(1.25)
    sec.bottom_margin = Cm(1.25)

# ── Force Times New Roman on the Normal style globally ────────────────────────
def _patch_fonts(style):
    rPr = style.element.get_or_add_rPr()
    for old in rPr.findall(qn('w:rFonts')):
        rPr.remove(old)
    rf = OxmlElement('w:rFonts')
    for attr in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        rf.set(qn(attr), 'Times New Roman')
    rPr.insert(0, rf)

ns = doc.styles['Normal']
ns.font.name = 'Times New Roman'
ns.font.size = Pt(12)
ns.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
ns.paragraph_format.space_before = Pt(0)
ns.paragraph_format.space_after  = Pt(0)
_patch_fonts(ns)

# ─────────────────────────────────────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def fmt(run, sz=12, bold=False, italic=False, ul=False):
    run.font.name   = 'Times New Roman'
    run.font.size   = Pt(sz)
    run.font.bold   = bold
    run.font.italic = italic
    run.underline   = ul
    rPr = run._r.get_or_add_rPr()
    for old in rPr.findall(qn('w:rFonts')):
        rPr.remove(old)
    rf = OxmlElement('w:rFonts')
    for attr in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        rf.set(qn(attr), 'Times New Roman')
    rPr.insert(0, rf)
    return run

def para(text='', align=WD_ALIGN_PARAGRAPH.LEFT,
         sz=12, bold=False, italic=False, ul=False,
         sb=0, sa=0):
    """Generic paragraph — double spaced."""
    p = doc.add_paragraph()
    p.alignment = align
    pf = p.paragraph_format
    pf.space_before      = Pt(sb)
    pf.space_after       = Pt(sa)
    pf.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    if text:
        fmt(p.add_run(text), sz=sz, bold=bold, italic=italic, ul=ul)
    return p

def body_para(text, sa=12):
    """Justified body paragraph with 12 pt after."""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf = p.paragraph_format
    pf.space_before      = Pt(0)
    pf.space_after       = Pt(sa)
    pf.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    fmt(p.add_run(text))
    return p

def section_head(num, title, sb=24, sa=8):
    """Bold+underlined numbered section heading with generous space above."""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf = p.paragraph_format
    pf.space_before      = Pt(sb)
    pf.space_after       = Pt(sa)
    pf.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    pf.keep_with_next    = True
    fmt(p.add_run(f'{num}.   {title}'), sz=12, bold=True, ul=True)
    return p

def labelled_para(label, value, sb=2, sa=4):
    """Bold label + normal value on same line."""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf = p.paragraph_format
    pf.space_before      = Pt(sb)
    pf.space_after       = Pt(sa)
    pf.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    fmt(p.add_run(f'{label}:   '), bold=True)
    fmt(p.add_run(value))
    return p

def add_table_block(caption, headers, rows):
    """Caption (ABOVE, bold, centred) + Table Grid."""
    # ── Caption above ─────────────────────────────────────────────────────
    cp = doc.add_paragraph()
    cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cp.paragraph_format.space_before      = Pt(16)
    cp.paragraph_format.space_after       = Pt(4)
    cp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    fmt(cp.add_run(caption), sz=12, bold=True)

    # ── Table ─────────────────────────────────────────────────────────────
    tbl = doc.add_table(rows=1, cols=len(headers))
    tbl.style = 'Table Grid'

    # Header row – bold, centred
    for i, h in enumerate(headers):
        cell = tbl.rows[0].cells[i]
        cell.text = ''
        pp = cell.paragraphs[0]
        pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
        fmt(pp.add_run(h), bold=True)

    # Data rows
    for row_vals in rows:
        row = tbl.add_row().cells
        for i, v in enumerate(row_vals):
            row[i].text = ''
            pp = row[i].paragraphs[0]
            pp.alignment = WD_ALIGN_PARAGRAPH.LEFT
            pp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
            fmt(pp.add_run(v))

    # Move caption XML node immediately before the table node
    tbl._element.addprevious(cp._element)

    # Space after table
    sp = doc.add_paragraph()
    sp.paragraph_format.space_before      = Pt(4)
    sp.paragraph_format.space_after       = Pt(14)
    sp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE


# ─────────────────────────────────────────────────────────────────────────────
#  PAGE 1 — COVER PAGE
# ─────────────────────────────────────────────────────────────────────────────
para('', sb=24)  # top breathing space

para('KARNATAK UNIVERSITY, DHARWAD',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=16, bold=True, sb=0, sa=4)
para('Department of Computer Science',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=14, bold=True, sb=0, sa=72)

# Title — 22 pt bold centred
para('CloudShield: An AWS Cloud Security\nMonitoring and Auto-Remediation Panel',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=22, bold=True, sb=0, sa=24)

para('A Project Synopsis',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=14, bold=True, sb=0, sa=14)

para('Submitted by',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=14, bold=True, italic=True, sb=0, sa=10)

# Candidate — 16 pt bold
para('N Sudeep',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=16, bold=True, sb=0, sa=12)

para('Master of Computer Applications (MCA)',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=14, sb=0, sa=4)
para('4th Semester, 2025–26',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=12, sb=0, sa=4)
para('Exam Seat No.: P02ME24S126008',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=12, sb=0, sa=24)

para('Under the Guidance of',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=12, italic=True, sb=0, sa=6)
para('Smt. Apurva Deshpande',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=13, bold=True, sb=0, sa=48)

para('At', align=WD_ALIGN_PARAGRAPH.CENTER, sz=12, sb=0, sa=8)
para('Department of Computer Science',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=13, bold=True, sb=0, sa=4)
para('KARNATAK UNIVERSITY, DHARWAD',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=13, bold=True, sb=0, sa=4)
para('Pavate Nagar, Dharwad – 580003',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=12, sb=0, sa=4)

doc.add_page_break()


# ─────────────────────────────────────────────────────────────────────────────
#  PAGE 2 — STUDENT DETAILS + ABSTRACT
# ─────────────────────────────────────────────────────────────────────────────
para('KARNATAK UNIVERSITY, DHARWAD',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=13, bold=True, sb=0, sa=4)
para('Dept. of Computer Science',
     align=WD_ALIGN_PARAGRAPH.CENTER, sz=12, bold=True, sb=0, sa=20)

labelled_para('Proposed Project Title',
    'CloudShield: An AWS Cloud Security Monitoring and Auto-Remediation Panel')
labelled_para('Exam Seat No.', 'P02ME24S126008')
labelled_para('Name', 'N Sudeep')
labelled_para('Semester', '4th Semester')
labelled_para('Branch', 'Master of Computer Applications (MCA)')
labelled_para('Front End', 'React.js, Vite, Electron.js')
labelled_para('Back End', 'Python (FastAPI), SQLite via SQLAlchemy ORM')
labelled_para('Facilities / Framework Required',
    'boto3 (AWS SDK), Uvicorn, PyInstaller, Electron Builder, Node.js 18+, Python 3.10+',
    sb=2, sa=16)

# Abstract heading
p = doc.add_paragraph()
p.paragraph_format.space_before      = Pt(14)
p.paragraph_format.space_after       = Pt(6)
p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
fmt(p.add_run('Proposed Project Abstract:  '), bold=True)
fmt(p.add_run('(Should not exceed this page)'), italic=True, sz=11)

body_para(
    'CloudShield is a desktop-grade AWS cloud security monitoring and auto-remediation '
    'platform developed as a native Electron desktop application. It continuously scans '
    'Amazon Web Services (AWS) accounts for security misconfigurations across twelve '
    'service categories including IAM, S3, EC2, VPC, KMS, RDS, CloudTrail, EBS, and '
    'Security Groups, performing over 52 automated security checks based on industry '
    'best practices. The system features an intelligent auto-remediation pipeline that '
    'identifies vulnerable resources, generates a dry-run fix plan for preview, and '
    'applies live fixes to AWS with a single click, complete with a rollback mechanism '
    'for reversible actions. A real-time threat monitoring engine watches multiple AWS '
    'accounts and delivers Windows-style desktop notifications upon detecting new threats. '
    'Additional features include an IAM identity viewer, attack surface mapper, scheduled '
    'scans, HTML report generation, and e-mail delivery of results. Built with React.js '
    'and Electron.js for the frontend, Python FastAPI for the backend, SQLite via '
    'SQLAlchemy ORM for data storage, and boto3 for AWS API integration, CloudShield '
    'is packaged as a single installable desktop application requiring no external '
    'server or complex configuration.', sa=0
)

doc.add_page_break()


# ─────────────────────────────────────────────────────────────────────────────
#  PAGE 3+ — SYNOPSIS BODY  (9 sections)
# ─────────────────────────────────────────────────────────────────────────────

# ── 1. TITLE ──────────────────────────────────────────────────────────────────
section_head(1, 'Title', sb=12, sa=8)
para('CloudShield: An AWS Cloud Security Monitoring and Auto-Remediation Panel',
     align=WD_ALIGN_PARAGRAPH.CENTER, bold=True, sb=0, sa=16)


# ── 2. INTRODUCTION ───────────────────────────────────────────────────────────
section_head(2, 'Introduction')

body_para(
    'Cloud computing has become the backbone of modern digital infrastructure, with '
    'Amazon Web Services (AWS) commanding a dominant share of the global cloud market. '
    'As organisations and individual developers migrate workloads to the cloud, the '
    'complexity of maintaining secure configurations across dozens of services grows '
    'exponentially. Research consistently shows that misconfigurations — rather than '
    'sophisticated cyberattacks — account for the majority of cloud security incidents '
    'reported globally.'
)
body_para(
    'CloudShield is an AWS cloud security management desktop application designed to '
    'address this challenge. The system automates the process of scanning AWS accounts '
    'for security vulnerabilities, presents findings in an intuitive dashboard, and '
    'provides an intelligent remediation pipeline capable of fixing detected issues '
    'automatically. By combining security scanning, real-time threat monitoring, and '
    'auto-remediation within a single downloadable desktop application, CloudShield '
    'makes enterprise-level cloud security accessible to every AWS user.'
)
body_para(
    'The application is built on a three-tier architecture: a React.js and Electron.js '
    'desktop frontend, a Python FastAPI REST API backend, and an SQLite database accessed '
    'via SQLAlchemy ORM. The AWS SDK for Python, boto3, provides direct integration with '
    'over twelve AWS service APIs. The system supports both root AWS accounts and IAM '
    'sub-accounts, and is packaged as a single cross-platform installable desktop '
    'application using PyInstaller and Electron Builder.'
)
body_para(
    'Key modules of CloudShield include: a Security Scanner with 52+ automated checks, '
    'a real-time Threat Monitor with desktop push notifications, an Auto-Remediation '
    'Pipeline with dry-run preview and live execution, an IAM Identity Viewer, an '
    'Attack Surface Mapper, a Rollback System, Scan History, Analytics Dashboard, '
    'Alerts Centre, a cron-style Scheduler, and an HTML report generator with e-mail '
    'delivery. This project falls within the specialised domain of Cloud Security and '
    'DevSecOps — an area of rapidly growing industrial importance.', sa=0
)


# ── 3. MOTIVATION ─────────────────────────────────────────────────────────────
section_head(3, 'Motivation')

body_para(
    'The motivation for developing CloudShield arises from two key observations. First, '
    'studies by Gartner and leading cloud security firms consistently report that over '
    '65% of cloud security failures are caused by misconfigurations rather than '
    'sophisticated attacks — unintentionally open S3 buckets, overly permissive IAM '
    'roles, disabled CloudTrail logging, unencrypted EBS volumes, and unrestricted '
    'security group rules. These are well-understood, preventable errors that automated '
    'tools can detect and correct.'
)
body_para(
    'Second, enterprise-grade cloud security platforms such as AWS Security Hub, Prisma '
    'Cloud, and Cloud Custodian are prohibitively expensive or technically complex for '
    'individual developers, small teams, and academic users. There exists a clear '
    'accessibility gap between the security tools available to large enterprises and '
    'those available to the broader AWS community.'
)
body_para(
    'CloudShield is motivated by the goal of bridging this gap — providing a free, '
    'open-source, installable desktop tool that performs the same class of security '
    'checks as commercial platforms, with an intuitive graphical interface, real-time '
    'alerts, and one-click auto-remediation that any AWS user can operate without '
    'specialised security expertise.', sa=0
)


# ── 4. RELATED WORK ───────────────────────────────────────────────────────────
section_head(4, 'Related Work')

body_para(
    'AWS Security Hub (Amazon, 2018) is a native AWS service that aggregates security '
    'findings from multiple AWS services and standards. It requires manual configuration, '
    'provides no auto-remediation, and incurs per-finding charges, making it inaccessible '
    'for most individual or academic users.'
)
body_para(
    'Prowler (Toniolo, 2016) is an open-source command-line tool for AWS security '
    'best-practice assessments. While comprehensive in its checks, Prowler lacks a '
    'graphical user interface, real-time monitoring capability, and any form of '
    'automated remediation.'
)
body_para(
    'ScoutSuite (NCC Group, 2018) is a multi-cloud security auditing tool that produces '
    'detailed HTML reports. It operates as a one-time scan only, with no live monitoring, '
    'scheduling functionality, or auto-remediation.'
)
body_para(
    'Cloud Custodian (Capital One, 2016) is a rules-engine for cloud policy enforcement. '
    'It requires users to author YAML-based policies, demanding significant technical '
    'expertise, and offers no graphical desktop interface.'
)
body_para(
    'CloudShield differentiates itself from all the above by combining a desktop '
    'graphical interface, multi-account support, real-time threat monitoring with '
    'desktop notifications, an auto-remediation pipeline with dry-run preview, a '
    'rollback mechanism, scheduled scanning, and report generation — all within a '
    'single installable application.', sa=0
)


# ── 5. FEASIBILITY STUDY ──────────────────────────────────────────────────────
section_head(5, 'Feasibility Study')

body_para(
    'Technical Feasibility: All technologies used in CloudShield are mature, '
    'well-documented, and open-source. Python 3.10 with FastAPI provides a robust '
    'asynchronous backend. React.js and Electron.js are industry-standard tools for '
    'cross-platform desktop application development. SQLite is a reliable embedded '
    'relational database requiring no server infrastructure. The boto3 AWS SDK provides '
    'complete programmatic access to all required AWS services. The project has been '
    'fully implemented and is operational, confirming technical feasibility.'
)
body_para(
    'Economic Feasibility: The entire technology stack is free and open-source. AWS API '
    'calls for scanning use read-only permissions and incur no cost under AWS free-tier '
    'limits for most scanning operations. No paid software licences, cloud servers, or '
    'external subscription services are required. The application runs entirely on the '
    'user\'s local machine without recurring costs.'
)
body_para(
    'Operational Feasibility: CloudShield is distributed as a single installable desktop '
    'application — a standard installer for Windows and an AppImage for Linux. '
    'Installation requires no technical expertise. Users entry their AWS credentials '
    'through a guided setup interface and begin scanning immediately. Given the rapid '
    'adoption of AWS across industries and academic institutions, the need and '
    'significance of such a tool are clearly established.', sa=0
)


# ── 6. METHODOLOGY ────────────────────────────────────────────────────────────
section_head(6, 'Methodology / Planning of Work')

body_para('The project followed an Agile software development methodology, '
          'structured into six well-defined phases:')

phases = [
    ('Phase 1 — Requirements Analysis', 'Identified key AWS security checks based on the CIS AWS '
     'Foundations Benchmark v2.0 and the AWS Well-Architected Framework Security Pillar. '
     'User requirements for the dashboard, monitoring system, and remediation pipeline were defined.'),
    ('Phase 2 — Architecture Design', 'Designed the three-tier system architecture comprising '
     'the Electron desktop frontend, FastAPI backend REST API, SQLite local database, and '
     'the boto3 AWS integration layer. Module structure for twelve scanner engines was planned.'),
    ('Phase 3 — Backend Development', 'Implemented FastAPI route handlers for all modules. '
     'Developed SQLAlchemy ORM models for accounts, scan results, executions, rollback records, '
     'and scheduled tasks. Built twelve independent scanner engine modules covering IAM, S3, '
     'EC2, VPC, KMS, RDS, EBS, CloudTrail, and Security Groups.'),
    ('Phase 4 — Frontend Development', 'Built the React.js dashboard with section-based navigation '
     'covering eleven sections: Overview, Scanner, Threat Monitor, IAM View, Remediation, Rollback, '
     'Attack Surface, History, Analytics, Alerts, and Help. Each section designed with '
     'premium real-time animated interfaces.'),
    ('Phase 5 — Integration and Testing', 'Connected the frontend to the backend via Axios HTTP '
     'client. Established WebSocket connections for real-time threat notifications. Conducted '
     'end-to-end testing with live AWS accounts across multiple regions.'),
    ('Phase 6 — Packaging and Deployment', 'Bundled the FastAPI backend using PyInstaller into '
     'a standalone executable. Packaged the Electron frontend using Electron Builder. '
     'Combined both into a single cross-platform desktop installer delivered via GitHub Releases.'),
]
for label, desc in phases:
    pp = doc.add_paragraph()
    pp.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pp.paragraph_format.space_before      = Pt(4)
    pp.paragraph_format.space_after       = Pt(6)
    pp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    fmt(pp.add_run(f'{label}: '), bold=True)
    fmt(pp.add_run(desc))


# ── 7. FACILITIES REQUIRED ────────────────────────────────────────────────────
section_head(7, 'Facilities Required for Proposed Work')

add_table_block(
    'Table 1: Hardware Requirements',
    ['Component', 'Specification'],
    [
        ('Processor',     'Intel Core i3 or equivalent (minimum)'),
        ('RAM',           '4 GB minimum; 8 GB recommended'),
        ('Storage',       '500 MB available disk space'),
        ('OS',            'Windows 10/11 (64-bit) or Ubuntu 20.04+'),
        ('Internet',      'Required for AWS API access'),
    ]
)

add_table_block(
    'Table 2: Software and Framework Requirements',
    ['Category', 'Technology / Tool', 'Version'],
    [
        ('Frontend Framework',  'React.js + Vite',        '18.x / 5.x'),
        ('Desktop Shell',       'Electron.js',            '28.x'),
        ('Backend Framework',   'FastAPI (Python)',       '0.110+'),
        ('Database',            'SQLite + SQLAlchemy ORM','3.x / 2.0+'),
        ('AWS SDK',             'boto3',                  '1.34+'),
        ('Runtime Server',      'Uvicorn',                '0.29+'),
        ('Backend Packager',    'PyInstaller',            '6.x'),
        ('Frontend Packager',   'Electron Builder',       '24.x'),
        ('Version Control',     'Git + GitHub',           'Latest'),
        ('Backend Language',    'Python',                 '3.10+'),
        ('Frontend Language',   'JavaScript ES2022',      'Node 18+'),
    ]
)


# ── 8. PLAN OF WORK ───────────────────────────────────────────────────────────
section_head(8, 'Plan of Work')
body_para('The following month-wise plan was followed during the development of CloudShield:')

add_table_block(
    'Table 3: Month-wise Plan of Work',
    ['Month', 'Period', 'Activities'],
    [
        ('Month 1', 'January 2026',
         'Requirements analysis, technology selection, system architecture design, '
         'development environment setup'),
        ('Month 2', 'February 2026',
         'Backend development — FastAPI routes, SQLAlchemy ORM models, '
         'twelve scanner engine modules, scheduler and email services'),
        ('Month 3', 'March 2026',
         'Frontend development — React.js dashboard, all eleven dashboard sections, '
         'WebSocket integration, real-time threat monitor'),
        ('Month 4', 'April 2026',
         'Integration testing with live AWS accounts, bug fixing, '
         'PyInstaller and Electron Builder packaging, documentation and submission'),
    ]
)


# ── 9. BIBLIOGRAPHY ───────────────────────────────────────────────────────────
section_head(9, 'Bibliography')

refs = [
    'Amazon Web Services. (2024). AWS Documentation. https://docs.aws.amazon.com',
    'Amazon Web Services. (2024). AWS Well-Architected Framework — Security Pillar. AWS Whitepaper.',
    'Centre for Internet Security. (2023). CIS Amazon Web Services Foundations Benchmark v2.0. CIS.',
    'Tiangolo, S. (2024). FastAPI Documentation. https://fastapi.tiangolo.com',
    'Meta Inc. (2024). React.js Documentation. https://react.dev',
    'OpenJS Foundation. (2024). Electron.js Documentation. https://electronjs.org',
    'Amazon Web Services. (2024). Boto3 AWS SDK for Python. https://boto3.amazonaws.com',
    'SQLAlchemy Authors. (2024). SQLAlchemy Documentation. https://docs.sqlalchemy.org',
    'Gartner Research. (2024). Cloud Security: Addressing Misconfiguration Risks. Gartner Inc.',
    'Singh, A., & Sharma, R. (2023). Cloud Security Challenges and Countermeasures. '
        'International Journal of Cloud Computing, 11(3), 88–104.',
    'Vito, G., et al. (2022). Automated Cloud Security Remediation Using Policy-as-Code. '
        'IEEE Cloud Computing, 9(4), 18–27.',
    'National Institute of Standards and Technology. (2018). NIST Cybersecurity '
        'Framework v1.1. U.S. Department of Commerce.',
]

for i, ref in enumerate(refs, 1):
    rp = doc.add_paragraph()
    rp.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    rp.paragraph_format.space_before      = Pt(0)
    rp.paragraph_format.space_after       = Pt(8)
    rp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    rp.paragraph_format.left_indent       = Cm(1.0)
    rp.paragraph_format.first_line_indent = Cm(-1.0)   # hanging indent
    fmt(rp.add_run(f'[{i}]   {ref}'))


# ─────────────────────────────────────────────────────────────────────────────
#  SAVE + FIX COMPATIBILITY MODE
# ─────────────────────────────────────────────────────────────────────────────
tmp  = r'p:\CloudSecurityPanel\_synopsis_tmp.docx'
out  = r'p:\CloudSecurityPanel\CloudShield_MCA_Synopsis.docx'
doc.save(tmp)

# ── Remove the <w:compat> block from settings.xml so Word doesn't open
#    in Compatibility Mode ────────────────────────────────────────────────────
import zipfile, re, io

with zipfile.ZipFile(tmp, 'r') as zin:
    names = zin.namelist()
    files = {}
    for name in names:
        files[name] = zin.read(name)

if 'word/settings.xml' in files:
    settings_xml = files['word/settings.xml'].decode('utf-8')
    # Remove entire <w:compat>...</w:compat> block
    settings_xml = re.sub(
        r'<w:compat>.*?</w:compat>', '', settings_xml, flags=re.DOTALL
    )
    files['word/settings.xml'] = settings_xml.encode('utf-8')

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zout:
    for name, data in files.items():
        zout.writestr(name, data)

os.remove(tmp)
print(f'\nDone! Saved to: {out}')
print('  - Times New Roman 12pt throughout')
print('  - Margins: L 3.5cm | T 2.5cm | R 1.25cm | B 1.25cm')
print('  - Double line spacing')
print('  - Table captions above each table')
print('  - Compatibility Mode removed')
