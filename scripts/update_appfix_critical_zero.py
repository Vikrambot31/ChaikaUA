from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
ET.register_namespace("w", NS["w"])


def set_cell(tables, table_index, row_index, cell_index, text):
    cell = tables[table_index].findall("./w:tr", NS)[row_index].findall("./w:tc", NS)[cell_index]
    paragraphs = cell.findall("./w:p", NS)
    if not paragraphs:
        paragraph = ET.SubElement(cell, f"{{{NS['w']}}}p")
        run = ET.SubElement(paragraph, f"{{{NS['w']}}}r")
        node = ET.SubElement(run, f"{{{NS['w']}}}t")
        node.text = text
        return

    first = True
    for paragraph in paragraphs:
        text_nodes = paragraph.findall(".//w:t", NS)
        if first:
            if text_nodes:
                text_nodes[0].text = text
                for node in text_nodes[1:]:
                    node.text = ""
            else:
                run = ET.SubElement(paragraph, f"{{{NS['w']}}}r")
                node = ET.SubElement(run, f"{{{NS['w']}}}t")
                node.text = text
            first = False
        else:
            for node in text_nodes:
                node.text = ""


def main():
    doc_path = sorted(Path(".").glob("*актуально.docx"), key=lambda p: p.stat().st_mtime, reverse=True)[0]

    with zipfile.ZipFile(doc_path, "r") as source:
        files = {name: source.read(name) for name in source.namelist()}

    root = ET.fromstring(files["word/document.xml"])
    tables = root.findall(".//w:tbl", NS)

    set_cell(tables, 0, 1, 1, "0")
    set_cell(tables, 0, 1, 3, "Критическая age-verification 18+ закрыта: публикация dating/coffee требует серверной проверки возраста.")
    set_cell(tables, 0, 2, 1, "0")
    set_cell(tables, 0, 2, 3, "Критический аудит RTDB Rules закрыт: правила ужесточены, добавлены age-verification и safetyStatus.")
    set_cell(tables, 0, 3, 1, "0")
    set_cell(tables, 0, 3, 3, "NSFW/unsafe-риск и server-side auth rate limiting закрыты: фото требуют safety-review, вход переведен на rate-limited Cloud Function.")
    set_cell(tables, 0, 4, 1, "0")
    set_cell(tables, 0, 4, 3, "Критические ошибки сведены до 0 после закрытия 5 оставшихся пунктов. Обычные баги остаются отдельным списком.")

    set_cell(tables, 1, 33, 1, "-")
    set_cell(tables, 1, 33, 3, "Критическая часть закрыта: анкеты знакомств и coffee-заявки больше не публикуются только по введенному возрасту; требуется серверная age-verification.")

    set_cell(tables, 2, 18, 1, "-")
    set_cell(tables, 2, 18, 3, "Критическая часть закрыта: RTDB Rules ужесточены для dating/coffee, community_photos, age_verifications и широкого доступа places; аудит критических прав завершен.")
    set_cell(tables, 2, 20, 1, "-")
    set_cell(tables, 2, 20, 3, "Критическая часть закрыта: загрузка фото получает safetyStatus, а публикация approved разрешается только после safety-review или ручной проверки модератором.")

    set_cell(tables, 3, 7, 1, "-")
    set_cell(tables, 3, 7, 3, "Критическая часть закрыта: фото галереи не может стать approved без safetyStatus passed/manual_reviewed; загрузка блокирует неподдерживаемые или подозрительные файлы.")
    set_cell(tables, 3, 16, 1, "-")
    set_cell(tables, 3, 16, 3, "Критическая часть закрыта: email/password вход переведен на Cloud Function signInWithEmailRateLimited с серверным лимитом попыток и custom token.")

    files["word/document.xml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(doc_path, "w", zipfile.ZIP_DEFLATED) as target:
        for name, data in files.items():
            target.writestr(name, data)

    print(doc_path)


if __name__ == "__main__":
    main()
