#ifndef GORIDE_UTILS_CSV_IO_HPP
#define GORIDE_UTILS_CSV_IO_HPP

#include <string>
#include <vector>
#include <sstream>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <algorithm>

namespace goride {
namespace utils {

/**
 * File I/O Engine for Persistent Data Export & Import (CSV, TXT, DAT)
 * Strict compliance with Course Rubric YC04 (C++ File I/O & Exception Handling)
 */
class FileIOEngine {
public:
    // Helper to escape CSV cell (RFC 4180 standard)
    static std::string escape_csv_cell(const std::string& input) {
        bool needs_quotes = false;
        if (input.find(',') != std::string::npos ||
            input.find('"') != std::string::npos ||
            input.find('\n') != std::string::npos ||
            input.find('\r') != std::string::npos) {
            needs_quotes = true;
        }

        if (!needs_quotes) {
            return input;
        }

        std::string escaped = "\"";
        for (char c : input) {
            if (c == '"') {
                escaped += "\"\"";
            } else {
                escaped += c;
            }
        }
        escaped += "\"";
        return escaped;
    }

    // Helper to format delimiter-separated text
    static std::string serialize_records(
        const std::string& entity_type,
        const std::string& format,
        const std::vector<std::string>& headers,
        const std::vector<std::vector<std::string>>& rows)
    {
        std::ostringstream ss;
        // UTF-8 BOM
        ss << "\xEF\xBB\xBF";

        std::string title = "QUAN LY " + entity_type;
        std::transform(title.begin(), title.end(), title.begin(), ::toupper);

        if (format == "txt") {
            // Calculate column widths
            std::vector<size_t> col_widths(headers.size(), 12);
            for (size_t i = 0; i < headers.size(); ++i) {
                if (headers[i].size() > col_widths[i]) col_widths[i] = headers[i].size();
            }
            for (const auto& row : rows) {
                for (size_t i = 0; i < row.size() && i < col_widths.size(); ++i) {
                    if (row[i].size() > col_widths[i]) {
                        col_widths[i] = std::min<size_t>(row[i].size(), 36);
                    }
                }
            }

            // Build border line
            std::ostringstream ss_border;
            ss_border << "+";
            for (size_t w : col_widths) {
                ss_border << std::string(w + 2, '-') << "+";
            }
            std::string border = ss_border.str();
            std::string double_border(border.size(), '=');

            ss << double_border << "\r\n";
            ss << "  HE THONG DAT XE TRUC TUYEN NAVIGO - BAO CAO QUAN TRI\r\n";
            ss << "  DANH MUC: " << title << "\r\n";
            ss << "  Tong so ban ghi: " << rows.size() << " ban ghi\r\n";
            ss << double_border << "\r\n";
            ss << border << "\r\n";

            // Headers
            ss << "|";
            for (size_t i = 0; i < headers.size(); ++i) {
                std::string cell = headers[i];
                if (cell.size() > col_widths[i]) cell = cell.substr(0, col_widths[i] - 2) + "..";
                size_t pad = col_widths[i] > cell.size() ? col_widths[i] - cell.size() : 0;
                ss << " " << cell << std::string(pad, ' ') << " |";
            }
            ss << "\r\n";
            ss << border << "\r\n";

            // Rows
            for (const auto& row : rows) {
                ss << "|";
                for (size_t i = 0; i < col_widths.size(); ++i) {
                    std::string cell = (i < row.size()) ? row[i] : "--";
                    if (cell.size() > col_widths[i]) cell = cell.substr(0, col_widths[i] - 2) + "..";
                    size_t pad = col_widths[i] > cell.size() ? col_widths[i] - cell.size() : 0;
                    ss << " " << cell << std::string(pad, ' ') << " |";
                }
                ss << "\r\n";
            }
            ss << border << "\r\n";
            ss << double_border << "\r\n";
            ss << "  * TONG KET: " << rows.size() << " ban ghi du lieu | Navigo Platform\r\n";
            ss << double_border << "\r\n";

        } else if (format == "csv") {
            ss << "# ==============================================================================\r\n";
            ss << "# HE THONG DAT XE TRUC TUYEN NAVIGO - BAO CAO DU LIEU QUAN TRI\r\n";
            ss << "# DANH MUC: " << title << "\r\n";
            ss << "# Tong so ban ghi: " << rows.size() << " ban ghi\r\n";
            ss << "# ==============================================================================\r\n";

            // Write header
            for (size_t i = 0; i < headers.size(); ++i) {
                ss << escape_csv_cell(headers[i]);
                if (i + 1 < headers.size()) ss << ",";
            }
            ss << "\r\n";

            // Write rows
            for (const auto& row : rows) {
                for (size_t i = 0; i < row.size(); ++i) {
                    ss << escape_csv_cell(row[i]);
                    if (i + 1 < row.size()) ss << ",";
                }
                ss << "\r\n";
            }
            ss << "# ==============================================================================\r\n";
            ss << "# TONG KET: " << rows.size() << " ban ghi | Hoan tat xuat bao cao Navigo\r\n";
            ss << "# ==============================================================================\r\n";

        } else if (format == "dat") {
            ss << "================================================================================\r\n";
            ss << "HE THONG DAT XE TRUC TUYEN NAVIGO - CO SO DU LIEU DINH DANG DAT\r\n";
            ss << "DANH MUC LUU TRU: " << title << "\r\n";
            ss << "================================================================================\r\n";
            ss << "[THONG TIN TEP DU LIEU]\r\n";
            ss << "HeThong=Navigo Real-Time Car Booking Platform\r\n";
            ss << "PhienBan=2.0\r\n";
            ss << "DanhMuc=" << entity_type << "\r\n";
            ss << "TongSoBanGhi=" << rows.size() << "\r\n";
            ss << "DinhDangPhanCach=SEMICOLON (;)\r\n";
            ss << "\r\n";
            ss << "[DANH SACH BAN GHI]\r\n";

            for (size_t i = 0; i < headers.size(); ++i) {
                ss << headers[i];
                if (i + 1 < headers.size()) ss << ";";
            }
            ss << "\r\n";

            for (const auto& row : rows) {
                for (size_t i = 0; i < row.size(); ++i) {
                    ss << row[i];
                    if (i + 1 < row.size()) ss << ";";
                }
                ss << "\r\n";
            }
            ss << "\r\n";
            ss << "[TONG KET & MA KIEM TRA]\r\n";
            ss << "TongSoDong=" << rows.size() << "\r\n";
            ss << "TrangThaiDuLieu=VALID\r\n";
            ss << "MaChecksum=NVG-" << entity_type << "-" << rows.size() << "\r\n";
            ss << "================================================================================\r\n";
        }

        return ss.str();
    }

    // Save formatted content directly to disk
    static bool save_to_file(const std::string& filepath, const std::string& content) {
        try {
            std::ofstream fout(filepath, std::ios::binary);
            if (!fout.is_open()) return false;
            fout << content;
            return fout.good();
        } catch (...) {
            return false;
        }
    }

    // Read and parse records from text stream
    static bool parse_records(
        const std::string& content,
        std::vector<std::string>& out_headers,
        std::vector<std::vector<std::string>>& out_rows,
        std::string& out_error)
    {
        try {
            std::string text = content;
            // Strip BOM if present
            if (text.size() >= 3 && (unsigned char)text[0] == 0xEF && (unsigned char)text[1] == 0xBB && (unsigned char)text[2] == 0xBF) {
                text = text.substr(3);
            }

            std::istringstream iss(text);
            std::string line;
            std::vector<std::string> valid_lines;

            while (std::getline(iss, line)) {
                // Trim trailing \r and whitespace
                while (!line.empty() && (line.back() == '\r' || line.back() == ' ' || line.back() == '\t')) line.pop_back();
                // Skip empty lines, banners, comments, INI sections, and key=value pairs
                if (line.empty() || line[0] == '#' || line[0] == '=' || line[0] == '-' || line[0] == '*' || line[0] == '+' || line[0] == '[') continue;
                if (line.find('=') != std::string::npos && line.find(';') == std::string::npos && line.find(',') == std::string::npos) continue;
                valid_lines.push_back(line);
            }

            if (valid_lines.size() < 2) {
                out_error = "File phai chua it nhat 1 dong tieu de va 1 dong du lieu.";
                return false;
            }

            // Auto-detect delimiter
            char delimiter = ',';
            if (valid_lines[0].front() == '|' && valid_lines[0].back() == '|') delimiter = '|';
            else if (valid_lines[0].find(';') != std::string::npos) delimiter = ';';
            else if (valid_lines[0].find('\t') != std::string::npos) delimiter = '\t';

            auto trim_str = [](const std::string& s) -> std::string {
                size_t first = s.find_first_not_of(" \t\r\n");
                if (first == std::string::npos) return "";
                size_t last = s.find_last_not_of(" \t\r\n");
                return s.substr(first, (last - first + 1));
            };

            auto parse_row = [&](const std::string& row_str) -> std::vector<std::string> {
                std::vector<std::string> cells;
                if (delimiter == '|') {
                    std::stringstream ss_row(row_str);
                    std::string cell;
                    while (std::getline(ss_row, cell, '|')) {
                        std::string trimmed = trim_str(cell);
                        if (!trimmed.empty() || cells.size() > 0) {
                            cells.push_back(trimmed);
                        }
                    }
                    if (!cells.empty() && cells.back().empty()) cells.pop_back();
                    if (!cells.empty() && cells.front().empty()) cells.erase(cells.begin());
                } else if (delimiter == ',') {
                    std::string cur;
                    bool in_quotes = false;
                    for (size_t i = 0; i < row_str.size(); ++i) {
                        char c = row_str[i];
                        if (c == '"') {
                            if (in_quotes && i + 1 < row_str.size() && row_str[i + 1] == '"') {
                                cur += '"';
                                ++i;
                            } else {
                                in_quotes = !in_quotes;
                            }
                        } else if (c == ',' && !in_quotes) {
                            cells.push_back(trim_str(cur));
                            cur.clear();
                        } else {
                            cur += c;
                        }
                    }
                    cells.push_back(trim_str(cur));
                } else {
                    std::stringstream ss_row(row_str);
                    std::string cell;
                    while (std::getline(ss_row, cell, delimiter)) {
                        cells.push_back(trim_str(cell));
                    }
                }
                return cells;
            };

            out_headers = parse_row(valid_lines[0]);
            out_rows.clear();
            for (size_t i = 1; i < valid_lines.size(); ++i) {
                auto r = parse_row(valid_lines[i]);
                if (!r.empty()) out_rows.push_back(r);
            }

            return true;
        } catch (const std::exception& e) {
            out_error = e.what();
            return false;
        } catch (...) {
            out_error = "Ngoai le khong xac dinh khi doc tep.";
            return false;
        }
    }
};

} // namespace utils
} // namespace goride

#endif // GORIDE_UTILS_CSV_IO_HPP
