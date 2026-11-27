#import <AppKit/AppKit.h>
#import <PDFKit/PDFKit.h>
#import <Vision/Vision.h>

static int fail(NSString *message) {
    fprintf(stderr, "%s\n", (message ?: @"本机文字识别暂不可用，请重试。").UTF8String);
    return 1;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3) return fail(@"缺少要识别的页码。");
        PDFDocument *document = [[PDFDocument alloc] initWithData:
            [[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile]];
        NSInteger first = atol(argv[1]), last = atol(argv[2]);
        if (!document || first < 1 || last < first || last > document.pageCount) {
            return fail(@"无法读取对应的 PDF 页面。");
        }

        NSMutableArray *pages = [NSMutableArray array];
        for (NSInteger number = first; number <= last; number++) {
            @autoreleasepool {
                PDFPage *page = [document pageAtIndex:number - 1];
                NSImage *thumbnail = [page thumbnailOfSize:NSMakeSize(2000, 2800) forBox:kPDFDisplayBoxCropBox];
                NSRect imageBounds = {NSZeroPoint, thumbnail.size};
                CGImageRef image = [thumbnail CGImageForProposedRect:&imageBounds context:nil hints:nil];
                if (!image) return fail(@"无法渲染 PDF 页面。");

                VNRecognizeTextRequest *request = [VNRecognizeTextRequest new];
                request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
                NSArray *languages = [VNRecognizeTextRequest supportedRecognitionLanguagesForTextRecognitionLevel:
                    request.recognitionLevel revision:request.revision error:NULL];
                request.recognitionLanguages = [languages containsObject:@"zh-Hans"] ? @[@"en-US", @"zh-Hans"] : @[@"en-US"];
                request.usesLanguageCorrection = YES;
                VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
                NSError *error = nil;
                if (![handler performRequests:@[request] error:&error]) return fail(error.localizedDescription);

                NSMutableArray *lines = [NSMutableArray array];
                for (VNRecognizedTextObservation *observation in request.results) {
                    VNRecognizedText *text = [observation topCandidates:1].firstObject;
                    if (text.string.length) [lines addObject:text.string];
                }
                [pages addObject:lines];
            }
        }
        NSData *json = [NSJSONSerialization dataWithJSONObject:pages options:0 error:nil];
        if (!json) return fail(@"无法返回识别结果。");
        [[NSFileHandle fileHandleWithStandardOutput] writeData:json];
    }
    return 0;
}
