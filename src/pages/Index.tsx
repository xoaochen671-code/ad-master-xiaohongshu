import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Loader2 } from "lucide-react";

// 定义处理后数据的结构
interface Keyword {
  keyword: string;
  phrase_match_type: number;
}

interface ProcessedData {
  advertiser_id: number;
  unit_id: number;
  keywords: Keyword[];
}

// 定义Excel行的数据结构
interface ExcelRow {
  "广告主id（短id）": number;
  "单元id": number;
  "否定词（1个词1行）": string;
  "匹配方式（0-精准匹配，1-短语匹配）": number;
}

interface ErrorInfo {
  advertiser_id: number;
  unit_id: number;
  message: string;
}

const IndexPage = () => {
  const [processedData, setProcessedData] = useState<ProcessedData[] | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorList, setErrorList] = useState<ErrorInfo[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDownloadTemplate = () => {
    const headers = [
      "广告主id（短id）",
      "单元id",
      "否定词（1个词1行）",
      "匹配方式（0-精准匹配，1-短语匹配）",
    ];
    const exampleData = [
      {
        "广告主id（短id）": 123456789,
        "单元id": 987654321,
        "否定词（1个词1行）": "免费",
        "匹配方式（0-精准匹配，1-短语匹配）": 1,
      },
      {
        "广告主id（短id）": 123456789,
        "单元id": 987654321,
        "否定词（1个词1行）": "教程",
        "匹配方式（0-精准匹配，1-短语匹配）": 0,
      },
      {
        "广告主id（短id）": 111222333,
        "单元id": 444555666,
        "否定词（1个词1行）": "破解",
        "匹配方式（0-精准匹配，1-短语匹配）": 1,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers, skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "批量加否模板");
    XLSX.writeFile(wb, "批量加否模板.xlsx");
    toast.success("模板文件已开始下载！");
  };

  const processExcelData = (data: ExcelRow[]): ProcessedData[] => {
    const groups = new Map<
      string,
      {
        advertiser_id: number;
        unit_id: number;
        keywords: Map<string, Keyword>;
      }
    >();

    for (const row of data) {
      const advertiserId = row["广告主id（短id）"];
      const unitId = row["单元id"];
      const keywordText = row["否定词（1个词1行）"];
      const matchType = row["匹配方式（0-精准匹配，1-短语匹配）"];

      if (
        advertiserId === undefined ||
        unitId === undefined ||
        keywordText === undefined ||
        matchType === undefined
      ) {
        console.warn("跳过包含缺失数据的行:", row);
        continue;
      }

      const key = `${advertiserId}-${unitId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          advertiser_id: Number(advertiserId),
          unit_id: Number(unitId),
          keywords: new Map<string, Keyword>(),
        });
      }

      const group = groups.get(key)!;
      if (!group.keywords.has(String(keywordText))) {
        group.keywords.set(String(keywordText), {
          keyword: String(keywordText),
          phrase_match_type: Number(matchType),
        });
      }
    }

    const result: ProcessedData[] = [];
    for (const group of groups.values()) {
      result.push({
        advertiser_id: group.advertiser_id,
        unit_id: group.unit_id,
        keywords: Array.from(group.keywords.values()),
      });
    }

    return result;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProcessedData(null);
    setErrorList([]);
    const loadingToast = toast.loading("正在处理文件...");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

        const result = processExcelData(json);
        setProcessedData(result);
        toast.success("文件处理成功！", { id: loadingToast });
      } catch (error) {
        console.error("处理文件时出错:", error);
        toast.error("文件处理失败，请检查文件格式是否正确。", {
          id: loadingToast,
        });
      } finally {
        setIsProcessing(false);
        event.target.value = "";
      }
    };
    reader.onerror = () => {
      toast.error("读取文件失败。", { id: loadingToast });
      setIsProcessing(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubmit = async () => {
    if (!processedData) {
      toast.error("请先处理文件。");
      return;
    }

    setIsSubmitting(true);
    setErrorList([]);
    const loadingToast = toast.loading("正在提交数据...");

    const requests = processedData.map(item =>
      fetch("https://adapi.xiaohongshu.com/api/open/jg/negative/keyword/batch/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(item),
      }).then(async response => {
        const responseData = await response.json().catch(() => null);
        if (!response.ok || (responseData && responseData.code !== 0)) {
          return {
            status: "failed",
            advertiser_id: item.advertiser_id,
            unit_id: item.unit_id,
            message: responseData?.message || "请求失败，无法解析错误信息。",
          };
        }
        return { status: "success" };
      }).catch(error => ({
        status: "failed",
        advertiser_id: item.advertiser_id,
        unit_id: item.unit_id,
        message: error.message || "网络请求失败",
      }))
    );

    const results = await Promise.all(requests);
    const newErrorList = results.filter(r => r.status === 'failed') as ErrorInfo[];

    setErrorList(newErrorList);
    setIsSubmitting(false);
    toast.dismiss(loadingToast);

    if (newErrorList.length > 0) {
      toast.error(`有 ${newErrorList.length} 个请求失败，请查看失败列表。`);
    } else {
      toast.success("所有数据已成功提交！");
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">
          小红书批量加否词工具
        </h1>

        <div className="grid md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>第一步：下载模板</CardTitle>
              <CardDescription>
                下载Excel模板文件，并根据格式要求填写内容。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleDownloadTemplate}>下载模板文件</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>第二步：上传文件</CardTitle>
              <CardDescription>上传填写好的Excel文件进行处理。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="excel-file">上传Excel文件</Label>
                <Input
                  id="excel-file"
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  disabled={isProcessing}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {isProcessing && (
          <div className="flex items-center justify-center mt-8">
            <Loader2 className="mr-2 h-8 w-8 animate-spin" />
            <span className="text-lg">正在处理中...</span>
          </div>
        )}

        {processedData && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>第三步：提交数据</CardTitle>
              <CardDescription>
                预览处理结果，然后点击按钮开始批量提交。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border bg-secondary rounded-md">
                <h4 className="font-semibold mb-2">处理结果预览</h4>
                <ScrollArea className="h-72 w-full">
                  <pre className="text-sm">{JSON.stringify(processedData, null, 2)}</pre>
                </ScrollArea>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      JSON.stringify(processedData, null, 2),
                    );
                    toast.success("结果已复制到剪贴板！");
                  }}
                >
                  复制结果
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  开始批量加否
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {errorList.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-destructive">失败列表</CardTitle>
              <CardDescription>
                以下是提交失败的请求及其错误信息。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>广告主ID</TableHead>
                    <TableHead>单元ID</TableHead>
                    <TableHead>失败信息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errorList.map((error, index) => (
                    <TableRow key={index}>
                      <TableCell>{error.advertiser_id}</TableCell>
                      <TableCell>{error.unit_id}</TableCell>
                      <TableCell>{error.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default IndexPage;