package in.apsp.suite;

import static in.apsp.suite.Store.*;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/examples")
class AdminExamples {
  private final Store store;
  AdminExamples(Store store){this.store=store;}
  private record Example(String module,String title,String detail,String stage,int value){}
  private static final List<Example> EXAMPLES=List.of(
    new Example("ORDER","Moss sofa & ottoman","Ananya Sharma · home delivery","Packed",48900),
    new Example("ORDER","Walnut dining set","Kabir Mehra · assembly booked","Confirmed",62800),
    new Example("ORDER","Reading corner pair","Meera Rao · showroom collection","Delivered",24900),
    new Example("REVIEW","Comfortable sofa cushions","Moss three-seat sofa · 5 stars","Published",5),
    new Example("REVIEW","Oak finish matches the photos","Ridge dining table · 4 stars","In review",4),
    new Example("REVIEW","Assembly experience","Sunday platform bed · 5 stars","Published",5),
    new Example("LEAD","Dining room consultation","Tara Shah · showroom enquiry","Qualified",65000),
    new Example("LEAD","Apartment furnishing","Arjun Iyer · website enquiry","Quoted",145000),
    new Example("LEAD","Reading chair enquiry","Mira Das · referral","New",24000),
    new Example("VISIT","Measure dining alcove","Kabir Mehra · home visit","Scheduled",1),
    new Example("VISIT","Sofa fabric appointment","Ananya Sharma · showroom","Confirmed",2),
    new Example("VISIT","Assembly follow-up","Meera Rao · video consultation","Complete",1),
    new Example("CAMPAIGN","Monsoon upholstery edit","Consented living-room subscribers","Draft",120),
    new Example("CAMPAIGN","Dining preview evening","Showroom invite list","Scheduled",40),
    new Example("CAMPAIGN","Reading room collection","Consented catalogue subscribers","Complete",75),
    new Example("TICKET","Replacement drawer runner","Meera Rao · storage bed","Open",1),
    new Example("TICKET","Care guide for oak table","Kabir Mehra · dining","Assigned",1),
    new Example("TICKET","Assembly appointment change","Ananya Sharma · sofa","Resolved",1),
    new Example("JOB","Upholster a three-seat sofa","Workshop A · woven linen","In production",12),
    new Example("JOB","Finish dining tabletop","Joinery bench · oiled oak","Quality check",6),
    new Example("JOB","Build storage headboard","Workshop B · walnut","Scheduled",8),
    new Example("PURCHASE","Linen upholstery rolls","Pine Looms · supplier PO","Ordered",36000),
    new Example("PURCHASE","Oak veneer sheets","Timber Works · supplier PO","Part received",18400),
    new Example("PURCHASE","Drawer hardware sets","Urban Fittings · supplier PO","Received",7800),
    new Example("TRANSFER","Dining chairs to showroom","Outbound warehouse transfer","Requested",8),
    new Example("TRANSFER","Bed frame cartons","Incoming stock transfer","In transit",4),
    new Example("TRANSFER","Display side tables","Showroom replenishment","Received",3),
    new Example("RETURN","Lounge chair inspection","Customer collection booked","Requested",12900),
    new Example("RETURN","Dining chair exchange","Finish mismatch","Approved",7900),
    new Example("RETURN","Side table return","Showroom drop-off","Received",5200),
    new Example("Inventory","SF-101 · Moss three-seat sofa","Sellable units on hand","Available",8),
    new Example("Inventory","TB-303 · Ridge dining table","Units held for customers","Reserved",3),
    new Example("Inventory","CH-505 · Forma lounge chair","Units awaiting inspection","Inspection",2),
    new Example("Operations","AM delivery route","Crew A · 3 stops","Scheduled",3),
    new Example("Operations","Assembly van 02","Crew B · bedroom install","Dispatched",2),
    new Example("Operations","White-glove delivery","Crew C · dining set","Completed",1),
    new Example("Planning","Moss sofa demand","30-day sales forecast","Forecast",9),
    new Example("Planning","Oak dining restock","Reorder proposal","Review",6),
    new Example("Planning","Lounge chair allocation","Next showroom allocation","Planned",4),
    new Example("Customer history","Ananya Sharma","Sofa order and fabric consultation","Returning customer",2),
    new Example("Customer history","Kabir Mehra","Dining quote and measurement visit","Quotation",2),
    new Example("Customer history","Meera Rao","Lounge chair and care enquiry","New customer",1),
    new Example("Product catalogue","Moss three-seat sofa","SF-101 · woven linen","Published",48900),
    new Example("Product catalogue","Ridge dining table","TB-303 · oiled oak","Published",32900),
    new Example("Product catalogue","Forma lounge chair","CH-505 · sand linen","Draft",22800),
    new Example("Site studio","Living room collection","Landing page · /living-room","Published",3),
    new Example("Site studio","Delivery guide","Information page · /delivery","Draft",2),
    new Example("Site studio","Design appointment","Form · book a consultation","Published",4),
    new Example("Administration","Riya · branch manager","Showroom operations","Admin",3),
    new Example("Administration","Dev · warehouse lead","Stock and dispatch","Warehouse",2),
    new Example("Administration","Tara · design consultant","Design appointments","Designer",1),
    new Example("Ledger","Furniture sale receipt","Bank / Customer receivables","Posted",48900),
    new Example("Ledger","Supplier materials bill","Raw materials / Payables","Posted",18400),
    new Example("Ledger","Delivery expense","Freight / Bank","Posted",1500)
  );
  static void install(Store s) {
    if (!s.rows("select name from seed_version where name='admin-examples-v1'").isEmpty()) return;
    for (String branch:branches) for (Example e:EXAMPLES)
      s.db.update("insert into admin_example(module,branch,title,detail,stage,metric) values(?,?,?,?,?,?)",e.module(),branch,e.title(),e.detail(),e.stage(),e.value());
    s.db.update("insert into seed_version(name) values('admin-examples-v1')");
  }
  @GetMapping
  List<Map<String,Object>> list(@RequestAttribute("viewer") Map<String,Object> user) {
    role(user,"ADMIN");
    return permit(user,"SUPER_ADMIN") ? store.rows("select * from admin_example order by id") :
      store.rows("select * from admin_example where branch=? order by id",user.get("branch"));
  }
  @PostMapping("/{id}")
  @Transactional
  void change(@PathVariable long id,@RequestBody Map<String,Object> body,@RequestAttribute("viewer") Map<String,Object> user) {
    role(user,"ADMIN");
    var row=store.one("select * from admin_example where id=? for update",id);
    CatalogAdmin.scope(user,(String)row.get("branch"));
    if(id(body.get("revision"))!=id(row.get("revision")))throw fail(409,"This record changed. Refresh and try again.");
    String action=req(body,"action",16);
    if (Boolean.TRUE.equals(row.get("deleted")) != action.equals("restore"))throw fail(409,"Check the sample’s current archive status.");
    switch(action){
      case "edit" -> store.db.update("update admin_example set title=?,detail=?,stage=?,metric=?,revision=revision+1 where id=?",req(body,"title",140),req(body,"detail",350),req(body,"stage",60),price(body.get("metric")),id);
      case "enable","disable" -> store.db.update("update admin_example set enabled=?,revision=revision+1 where id=?",action.equals("enable"),id);
      case "delete","restore" -> store.db.update("update admin_example set deleted=?,revision=revision+1 where id=?",action.equals("delete"),id);
      default -> throw fail(400,"Choose a record action");
    }
  }
}
