#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

int main(void) {
    @autoreleasepool {
        NSData *input = [[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
        NSString *term = [[NSString alloc] initWithData:input encoding:NSUTF8StringEncoding];
        if (term.length == 0 || input.length > 12000) return 2;

        [[NSApplication sharedApplication] setActivationPolicy:NSApplicationActivationPolicyProhibited];
        NSPasteboard *board = [NSPasteboard pasteboardWithUniqueName];
        [board declareTypes:@[NSPasteboardTypeString] owner:nil];
        if (![board setString:term forType:NSPasteboardTypeString]) {
            [board releaseGlobally];
            return 2;
        }
        NSString *service = @"有道翻译 • 查询选中内容";
        BOOL performed = NSPerformService(service, board);
        if (!performed) {
            NSUpdateDynamicServices();
            performed = NSPerformService(service, board);
        }
        if (performed) {
            [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.35]];
        }
        [board releaseGlobally];
        return performed ? 0 : 3;
    }
}
