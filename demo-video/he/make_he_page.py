# Builds the Hebrew demo page (demo-video/he/) from the views page's own
# source: copies ViewsPage.jsx and DemoMandala.jsx and swaps every string the
# demo video shows for its Hebrew. Demo-only; the app's own files are not
# touched. Re-run after the views page changes:
#   python3 -I demo-video/he/make_he_page.py
# Each swap must match exactly once, so a changed page fails loudly here.
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'src', 'viewsdemo')

def swap(text, pairs, name):
    for old, new in pairs:
        n = text.count(old)
        assert n >= 1, f'{name}: not found: {old[:70]!r}'
        text = text.replace(old, new)
    return text

PAGE = [
    ("from '../engine/viewsDemo.js'", "from '../../src/engine/viewsDemo.js'"),
    ("from '../ui/icons.jsx'", "from '../../src/ui/icons.jsx'"),
    ("from './ringSides.js'", "from '../../src/viewsdemo/ringSides.js'"),
    ("toLocaleDateString(undefined,", "toLocaleDateString('he-IL',"),
    ("{standing && <span className=\"vd-src-standing\">{standing}</span>}",
     "{standing && <span className=\"vd-src-standing\">{STANDING_HE[standing] || standing}</span>}"),
    (">Notice the wording<", ">שימו לב לניסוח<"),
    ("' Views that reject that framing: '", "' עמדות שדוחות את המסגור הזה: '"),
    ("(map.live ? 'Said to hold it' : 'Held by')", "(map.live ? 'לפי הטענה, מחזיקים בה' : 'מחזיקים בה')"),
    ("['mid', 'striped', 'It depends']", "['mid', 'striped', 'תלוי']"),
    (">none of them<", ">אף אחת מהן<"),
    ("{c.reading.length} article{c.reading.length === 1 ? '' : 's'} on this question →",
     "{c.reading.length === 1 ? 'כתבה אחת' : `${c.reading.length} כתבות`} על השאלה הזאת ←"),
    ("{n > 0 ? `Its reasons and ${n} source${n === 1 ? '' : 's'}` : 'Its case'} →",
     "{n > 0 ? `הנימוקים שלה ו־${n === 1 ? 'מקור אחד' : `${n} מקורות`}` : 'הטיעון שלה'} ←"),
    (" — named by the model, not checked.", " — לפי המודל, לא נבדק."),
    (">Its answers<", ">התשובות שלה<"),
    (">Its reasons, and where they’re made<", ">הנימוקים שלה, והיכן הם נטענים<"),
    (">More from people who make this case<", ">עוד מאנשים שטוענים כך<"),
    (">No article found yet by someone who argues this view.<", ">עוד לא נמצאה כתבה של מי שטוען בעד העמדה הזאת.<"),
    ("<li><span>Closest to</span> {close.name}: same answer on {close.same} of {n}</li>",
     "<li><span>הכי קרובה אל</span> {close.name}: אותה תשובה ב־{close.same} מתוך {n}</li>"),
    ("<li><span>Stands apart</span> No other view shares any of its answers.</li>",
     "<li><span>עומדת לבדה</span> אף עמדה אחרת לא חולקת איתה תשובה.</li>"),
    ("<span>What would change its mind</span>", "<span>מה היה גורם לה לשנות את דעתה</span>"),
    ("{sheet ? 'Close' : '← All views'}", "{sheet ? 'סגירה' : '→ כל העמדות'}"),
    ("View {i + 1} of {map.views.length}", "עמדה {i + 1} מתוך {map.views.length}"),
    ("← {prev.short || prev.name}", "→ {prev.short || prev.name}"),
    ("{next.short || next.name} →", "{next.short || next.name} ←"),
    ("<span className=\"vd-end mid\">It depends</span>", "<span className=\"vd-end mid\">תלוי</span>"),
    ("<p className=\"vd-cap-how\"><b>Tap any stone</b> to read the pieces on that ring’s question; a ring finds more as you open it. <b>Tap a name</b> for that view’s whole case.</p>",
     "<p className=\"vd-cap-how\"><b>הקישו על אבן</b> כדי לקרוא את הכתבות על השאלה של אותה טבעת; טבעת מוצאת עוד כשפותחים אותה. <b>הקישו על שם</b> כדי לראות את כל הטיעון של אותה עמדה.</p>"),
    ("<span><b>Colour</b> = a view</span>", "<span><b>צבע</b> = עמדה</span>"),
    ("<span><b>Ring</b> = a question, numbered from the centre</span>", "<span><b>טבעת</b> = שאלה, ממוספרת מהמרכז</span>"),
    ("<span><b>Filled stone</b> = a piece arguing that answer; faint = none found yet</span>",
     "<span><b>אבן מלאה</b> = כתבה שטוענת בעד התשובה; חיוורת = עוד לא נמצאה</span>"),
    ("<span><b>More room</b> = the question matters more to that view</span>",
     "<span><b>יותר מקום</b> = השאלה חשובה יותר לאותה עמדה</span>"),
    ("/> first answer</span>", "/> תשובה ראשונה</span>"),
    ("/> second answer</span>", "/> תשובה שנייה</span>"),
    ("/> it depends</span>", "/> תלוי</span>"),
    ("Ring {k + 1} of {M}", "טבעת {k + 1} מתוך {M}"),
    ("aria-label=\"Close\">Close ✕</button>", "aria-label=\"Close\">סגירה ✕</button>"),
    ("</b> answers: {answerText(c, mine)}.{' '}", "</b> עונה: {answerText(c, mine)}.{' '}"),
    (">Its whole case →<", ">כל הטיעון שלה ←<"),
    ("Views here: {holders", "העמדות כאן: {holders"),
    (">Finding pieces that argue this…<", ">מחפשים כתבות שטוענות כך…<"),
    ("{filling ? 'Nothing found arguing this yet.' : 'No checked article on this side yet.'}",
     "{filling ? 'עוד לא נמצא משהו שטוען כך.' : 'עוד אין כתבה בדוקה בצד הזה.'}"),
    ("/>It depends: {mids", "/>תלוי: {mids"),
    ("{items.error ? 'Couldn’t look for pieces just now.' : (only ? 'Nothing turned up for this answer.' : 'Nothing turned up for one of the answers.')}",
     "{items.error ? 'לא הצלחנו לחפש כתבות כרגע.' : (only ? 'לא נמצא דבר לתשובה הזאת.' : 'לא נמצא דבר לאחת התשובות.')}"),
    (">Try again<", ">לנסות שוב<"),
    ("← Question {((k - 1 + M) % M) + 1}", "→ שאלה {((k - 1 + M) % M) + 1}"),
    ("Question {((k + 1) % M) + 1} →", "שאלה {((k + 1) % M) + 1} ←"),
    ("{map.live ? 'Mapped just now' : 'Ready example'} · {map.views.length} views · {map.cruxes.length} questions they split on{sources > 0\n            ? (map.live ? ` · ${sources} sources found by search, each opened to check it loads` : ` · ${sources} sources, each opened and read`)",
     "{map.live ? 'מופה עכשיו' : 'דוגמה מוכנה'} · {map.views.length} עמדות · {map.cruxes.length} שאלות שעליהן הן נחלקות{sources > 0\n            ? (map.live ? ` · ${sources} מקורות שנמצאו בחיפוש, כל אחד נפתח כדי לוודא שהוא עולה` : ` · ${sources} מקורות, כל אחד נפתח ונקרא`)"),
    ("The {map.cruxes.length} questions they split on</h2>", "{map.cruxes.length} השאלות שעליהן הן נחלקות</h2>"),
    (">One per ring. Tap one for real articles on each side of it.<", ">אחת לכל טבעת. הקישו על שאלה וקבלו כתבות אמיתיות מכל צד שלה.<"),
    ("The {map.views.length} main views</h2>", "{map.views.length} העמדות העיקריות</h2>"),
    (">Tap one to see its reasons and sources.<", ">הקישו על עמדה וראו את הנימוקים והמקורות שלה.<"),
    (">The {map.views.length} views<", ">{map.views.length} העמדות<"),
    (">The {map.cruxes.length} questions<", ">{map.cruxes.length} השאלות<"),
    (">Each question as a line, with every view placed on it<", ">כל שאלה כקו, וכל עמדה ממוקמת עליו<"),
    (">Every view’s full case, one after another<", ">הטיעון המלא של כל עמדה, אחת אחרי השנייה<"),
    ("['Finding the main views and who holds them', 'Working out the points they split on', 'Searching for articles by people who hold each view', 'Opening every link to check it']",
     "['מוצאים את העמדות העיקריות ואת מי שמחזיק בהן', 'מבררים את הנקודות שעליהן הן נחלקות', 'מחפשים כתבות של מי שמחזיק בכל עמדה', 'פותחים כל קישור כדי לבדוק אותו']"),
    (">Usually 20 to 40 seconds for a new question.<", ">בדרך כלל 20 עד 40 שניות לשאלה חדשה.<"),
    ("Mosaic<span className=\"vd-brand-sub\">Views</span></span>", "מוזאיקה</span>"),
    (">Every side of a question, who holds it, and their sources. Never a verdict.<",
     ">כל הצדדים של שאלה, מי מחזיק בכל אחד, והמקורות שלהם. אף פעם לא פסק דין.<"),
    ("placeholder=\"Or ask your own question\"", "placeholder=\"או שאלו שאלה משלכם\""),
    ("{busy ? 'Mapping…' : 'Map it'}", "{busy ? 'ממפים…' : 'מיפוי'}"),
    (">Typed questions aren’t switched on in this version yet. The ready examples are complete.<",
     ">שאלות מוקלדות עוד לא פועלות בגרסה הזאת. הדוגמאות המוכנות שלמות.<"),
    (">Try one of the ready examples above in the meantime.<", ">בינתיים נסו אחת מהדוגמאות המוכנות למעלה.<"),
    (">Questions near it that people do hold different views on:<", ">שאלות קרובות שאנשים כן חלוקים עליהן:<"),
    ("<p>This example was researched in {map.preparedOn || 'November 2026'}. Every link was opened and read to confirm it says what it’s cited for. Each view is summarised the way its own holders put it, and none is marked right or wrong.</p>",
     "<p>הדוגמה הזאת נחקרה ב{map.preparedOn || 'נובמבר 2026'}. כל קישור נפתח ונקרא כדי לוודא שהוא אומר את מה שמצטטים ממנו. כל עמדה מסוכמת כפי שמחזיקיה מנסחים אותה, ואף אחת לא מסומנת כנכונה או כשגויה.</p>"),
    ("<p>A typed question is mapped by AI from live web search. It only links pages it actually found, and opens each one to check it loads. It doesn’t pick a side, so read the sources themselves.</p>",
     "<p>שאלה מוקלדת ממופה בידי בינה מלאכותית מחיפוש חי ברשת. היא מקשרת רק לדפים שבאמת מצאה, ופותחת כל אחד כדי לוודא שהוא עולה. היא לא בוחרת צד, אז קראו את המקורות עצמם.</p>"),
]
MANDALA = [
    ("'It depends, or in between'", "'תלוי, או באמצע'"),
    (">Tap to</text>", ">הקישו כדי</text>"),
    (">explore</text>", ">לחקור</text>"),
]
HEADER = ("// GENERATED by demo-video/he/make_he_page.py from src/viewsdemo/{name}.\n"
          "// The Hebrew copy for the demo video only. Edit the generator, not this file.\n")
STANDING = """
// The page's standing labels, in Hebrew.
const STANDING_HE = {
  'Submitted to a hearing': 'הוגש לשימוע', 'Transcript of remarks': 'תמליל דברים',
  'Preprint, not peer reviewed': 'טיוטה, לא עברה ביקורת עמיתים', 'Posted to an open archive': 'פורסם בארכיון פתוח',
  'Peer reviewed': 'עבר ביקורת עמיתים', 'Government or official body': 'ממשלה או גוף רשמי', 'University': 'אוניברסיטה',
};
"""
page = open(os.path.join(SRC, 'ViewsPage.jsx')).read()
page = swap(page, PAGE, 'ViewsPage.jsx')
page = page.replace("const COLORS = [", STANDING.lstrip('\n') + "\nconst COLORS = [", 1)
open(os.path.join(HERE, 'ViewsPage.jsx'), 'w').write(HEADER.format(name='ViewsPage.jsx') + page)
mm = swap(open(os.path.join(SRC, 'DemoMandala.jsx')).read(), MANDALA, 'DemoMandala.jsx')
open(os.path.join(HERE, 'DemoMandala.jsx'), 'w').write(HEADER.format(name='DemoMandala.jsx') + mm)
left = [m for m in re.findall(r'>\s*([A-Z][a-z][^<>{}]{3,})<', page)]
print('built; English text nodes left:', left)
